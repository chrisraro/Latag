import { eq } from "drizzle-orm";
import * as Crypto from "expo-crypto";
import { items, photos, type Item } from "../db/schema";
import type { LatagDb } from "../db/client";
import { specRowsFor, SPEC_LABEL_TO_KEY, parseSpecValue, type CatalogItem, type SpecKey } from "./catalog";
import { currentUserId } from "./shop-api";
import { photoSetKey, writePhotoSync } from "./shop-sync";
import { supabase } from "./supabase";

/**
 * Shop restore — pulls published items back into local SQLite
 * after a data wipe (clear data / uninstall).
 *
 * PRIVACY NOTE: shop_items intentionally excludes cost, profit, location and
 * batch data. Those fields were never uploaded, so they cannot be recovered.
 * The user gets back their listings with photos and pricing; cost/profit
 * history is gone by design.
 *
 * Call this when a user wants to "restore from published" — i.e. re-download
 * their shop listings after losing local data.
 */

/** Same escape hatch lib/repo.ts uses for drizzle's transaction handle, whose
 *  full generic type is not worth spelling out at every call site. */
type AnyDb = any;

type ShopItemRow = {
  id: string;
  item_local_id: string;
  code: string;
  brand: string;
  name: string | null;
  department: string;
  category: string;
  condition: string;
  specs: { k: string; v: string }[] | Record<string, string>;
  price: number;
  status: "available" | "sold";
  photo_urls: string[];
  sort_order: number;
  published_at: string;
};

/** Machine-readable reason for a failed restore. Distinguishes *why* nothing
 *  came back from the (indistinguishable-looking) "shop is genuinely empty"
 *  success case, so a caller (sign-in flow, manual "Restore from shop"
 *  button) can decide whether to stay silent or surface an error. */
export type RestoreFailReason = "shop-lookup-failed" | "items-fetch-failed" | "unexpected-error";

/**
 * Discriminated union, mirroring the `ShopResult<T>` convention used
 * elsewhere in this module's neighbours (see ShopResult in shop-api.ts).
 * `restored`/`skipped` are only meaningful on success — a genuinely empty
 * shop (no shop row, or a shop with zero published items) is `{ ok: true,
 * restored: 0, skipped: 0 }`, same as "not signed in": none of those are
 * errors. A failure carries a stable `reason` for callers that branch on it,
 * plus a short `message` a UI can show as-is without re-deriving anything.
 */
export type RestoreOutcome =
  | { ok: true; restored: number; skipped: number }
  | { ok: false; reason: RestoreFailReason; message: string };

// ---------------------------------------------------------------------------
// Spec parsing (reverse of specRowsFor)
// ---------------------------------------------------------------------------

/**
 * Parse the ordered specs array from shop_items back into individual
 * spec columns. Handles both the new ordered-array format and the legacy
 * jsonb-object format.
 */
function parseSpecs(
  specs: ShopItemRow["specs"]
): Partial<Record<SpecKey, number>> {
  const result: Partial<Record<SpecKey, number>> = {};

  if (Array.isArray(specs)) {
    // New format: ordered array of { k, v }
    for (const { k, v } of specs) {
      const key = SPEC_LABEL_TO_KEY[k];
      if (key) {
        const num = parseSpecValue(v);
        if (num !== null) result[key] = num;
      }
    }
  } else if (specs && typeof specs === "object") {
    // Legacy format: jsonb object { "Waist": "32\"", ... }
    for (const [label, value] of Object.entries(specs)) {
      const key = SPEC_LABEL_TO_KEY[label];
      if (key && typeof value === "string") {
        const num = parseSpecValue(value);
        if (num !== null) result[key] = num;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Photo slot mapping
// ---------------------------------------------------------------------------

const PHOTO_SLOTS = ["front", "back", "tag", "flaw"] as const;

// ---------------------------------------------------------------------------
// Core restore
// ---------------------------------------------------------------------------

/**
 * Pulls all published items from Supabase for the current user and inserts
 * them into the local DB. Idempotent — skips items whose shopCode already
 * exists locally.
 *
 * Call this once after sign-in when the local DB has no items but Supabase
 * has shop_items.
 */
export async function restorePublishedItems(db: LatagDb): Promise<RestoreOutcome> {
  let restored = 0;
  let skipped = 0;

  try {
    // 0. Resolve the signed-in user. Mirrors getMyShop() in shop-api.ts —
    // without this, the query below has nothing to scope by. Not being
    // signed in is not an error here — it's an expected, silent no-op.
    const userId = await currentUserId();
    if (!userId) return { ok: true, restored: 0, skipped: 0 };

    // 1. Fetch the current user's own shop.
    //
    // MUST filter by user_id: the live "public shops" SELECT policy on
    // public.shops is qualified only on `is_published`, so an authenticated
    // caller can read every published shop, not just their own. An unscoped
    // `.single()` here picks the right row by luck when exactly one shop is
    // published; with two, Postgrest errors on the ambiguous result and
    // restore silently reports nothing. `.maybeSingle()` (vs `.single()`)
    // also makes "the user has no shop at all" resolve to
    // { data: null, error: null } instead of an error.
    const { data: shopRow, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (shopError) {
      return { ok: false, reason: "shop-lookup-failed", message: "Couldn't look up your shop — try again" };
    }
    // No shop of the user's own at all — genuinely nothing to restore, not a failure.
    if (!shopRow) return { ok: true, restored: 0, skipped: 0 };

    const { data: items_data, error: itemsError } = await supabase
      .from("shop_items")
      .select("*")
      .eq("shop_id", shopRow.id)
      .order("sort_order", { ascending: false });

    if (itemsError) {
      return { ok: false, reason: "items-fetch-failed", message: "Couldn't fetch your shop listings — try again" };
    }
    // Shop exists but has no published items — a genuinely empty shop, not a failure.
    if (!items_data || items_data.length === 0) return { ok: true, restored: 0, skipped: 0 };

    // 2. For each shop_item, check if it already exists locally
    for (const si of items_data as ShopItemRow[]) {
      const code = si.code?.trim().toUpperCase();
      if (!code) continue;

      // Skip if already exists locally
      const existing = db
        .select()
        .from(items)
        .where(eq(items.shopCode, code))
        .all();
      if (existing.length > 0) {
        skipped += 1;
        continue;
      }

      // 3. Parse specs back to individual columns
      const specs = parseSpecs(si.specs);

      // 4. Reuse the published identity (C1).
      //
      // `item_local_id` is NOT a dead id from the phone's previous life — it is
      // the storefront's identity for this listing. 0003_storefront.sql declares
      // `unique (shop_id, item_local_id)`, deleteShopItem filters on it,
      // upsertShopItem conflict-targets it, and the photos live at
      // {user_id}/{item_local_id}/. Minting a fresh uuid here orphans the
      // published row: the later DELETE matches zero rows, PostgREST reports no
      // error, the queue row drains as a success — and the seller is told
      // "Removed from shop" while the listing stays publicly live forever.
      //
      // Reusing it means inserting a caller-supplied primary key, so a clash
      // with a row the user already has locally is possible. That must cost
      // this one listing its published identity (degraded, but present and
      // visible) rather than throw into the catch-all and abandon the rest of
      // the shop.
      const publishedId = typeof si.item_local_id === "string" ? si.item_local_id.trim() : "";
      const idIsFree =
        publishedId.length > 0 &&
        db.select().from(items).where(eq(items.id, publishedId)).all().length === 0;
      const localId = idIsFree ? publishedId : Crypto.randomUUID();

      // 5. Insert the item.
      //
      // M4: guard the parse. `published_at` is whatever PostgREST emits for a
      // `timestamptz` — `2026-01-01T00:00:00+00:00`, not the `.000Z` an ISO
      // fixture produces — and an unparseable value would give NaN. That is not
      // cosmetic: the driver rejects the NaN bind, which takes the whole restore
      // into the catch-all and loses every remaining listing. Even if it bound,
      // a null publishedAt reads as UNPUBLISHED to lib/shop-sync, which then
      // drops the item's queue rows as "nothing to publish" forever.
      const parsedAt = si.published_at ? new Date(si.published_at) : new Date();
      const publishedAt = Number.isNaN(parsedAt.getTime()) ? new Date() : parsedAt;

      // The photos that will become this item's rows, in slot order. Sliced
      // once so the upload marker below and the inserts further down can never
      // disagree about which URLs actually landed locally.
      const slotUrls = (si.photo_urls ?? []).slice(0, PHOTO_SLOTS.length);

      // 5b. One item and its photos are ONE write (I3).
      //
      // The idempotency check above dedupes on `shopCode`, i.e. per item — but
      // the write is item + photos. Without this transaction, a photo insert
      // that throws leaves the item row committed, and the next attempt takes
      // the skip branch above: that listing's photos would never come back,
      // silently and permanently. All-or-nothing makes the dedupe unit and the
      // write unit the same thing again.
      db.transaction((tx: AnyDb) => {
        tx.insert(items)
          .values({
            id: localId,
            sessionId: null, // session association is lost — by design
            brand: si.brand,
            name: si.name ?? null,
            department: (si.department as Item["department"]) ?? "tops",
            category: si.category ?? "",
            condition: si.condition ?? "good",
            ptpInches: specs.ptpInches ?? null,
            lengthInches: specs.lengthInches ?? null,
            sleeveInches: specs.sleeveInches ?? null,
            waistInches: specs.waistInches ?? null,
            inseamInches: specs.inseamInches ?? null,
            riseInches: specs.riseInches ?? null,
            legOpeningInches: specs.legOpeningInches ?? null,
            shoeSizeUs: specs.shoeSizeUs ?? null,
            insoleCm: specs.insoleCm ?? null,
            widthInches: specs.widthInches ?? null,
            heightInches: specs.heightInches ?? null,
            depthInches: specs.depthInches ?? null,
            strapDropInches: specs.strapDropInches ?? null,
            sizeNote: null,
            individualCost: 0, // cost is lost — by design
            targetSellPrice: si.price ?? 0,
            status: si.status ?? "available",
            soldPrice: null, // sold price is lost — by design
            soldAt: null,
            createdAt: publishedAt,
            publishedAt,
            shopCode: code,
            // I2: seed the upload marker with the photos already in storage.
            //
            // The `localUri` written below is an `https://` URL — the bytes are
            // not on this phone. Left null, the next publish of this item would
            // see no recorded upload and hand those URLs to uploadItemPhotos →
            // FileSystem.readAsStringAsync, which accepts only `file://`. It
            // throws, the queue row burns all five attempts, and the seller is
            // stuck on "N changes pending" with no way to clear it.
            //
            // The key must be what lib/shop-sync recomputes from the photo rows:
            // orderedLocalUris sorts by SLOT_ORDER, which is the same order as
            // PHOTO_SLOTS, so the array written here is the array it will read.
            //
            // NOTE this only covers an *unchanged* photo set. Re-shooting one
            // photo on a restored item produces a mixed file:// + https:// set
            // that still fails on upload. Downloading photos to the local cache
            // is out of scope here; this does not pretend otherwise.
            photoSync: slotUrls.length
              ? writePhotoSync({ key: photoSetKey(slotUrls), urls: slotUrls })
              : null,
          })
          .run();

        // 6. Insert photo references (URLs from Supabase storage)
        for (let i = 0; i < slotUrls.length; i++) {
          tx.insert(photos)
            .values({
              id: Crypto.randomUUID(),
              itemId: localId,
              // Store the Supabase public URL as the localUri — the photo
              // is remote, not cached locally. This works for display but
              // requires network. A future enhancement could download to cache.
              localUri: slotUrls[i],
              type: PHOTO_SLOTS[i],
            })
            .run();
        }
      });

      restored += 1;
    }
  } catch {
    // Swallow errors — restore is best-effort and must never crash the app.
    // This is the only path an unexpected throw mid-loop (e.g. a SQLite
    // write failure) can take: it must resolve, not reject, and it must
    // still tell the caller this was a failure, not an empty shop.
    return { ok: false, reason: "unexpected-error", message: "Something went wrong restoring your shop" };
  }

  return { ok: true, restored, skipped };
}
