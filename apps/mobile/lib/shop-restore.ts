import { eq } from "drizzle-orm";
import * as Crypto from "expo-crypto";
import { items, photos, type Item } from "../db/schema";
import type { LatagDb } from "../db/client";
import { specRowsFor, SPEC_LABEL_TO_KEY, parseSpecValue, type CatalogItem, type SpecKey } from "./catalog";
import { currentUserId } from "./shop-api";
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

      // 4. Generate a new local ID (old item_local_id is meaningless now)
      const localId = Crypto.randomUUID();

      // 5. Insert the item
      const publishedAt = si.published_at ? new Date(si.published_at) : new Date();

      db.insert(items)
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
          photoSync: null,
        })
        .run();

      // 6. Insert photo references (URLs from Supabase storage)
      const photoUrls = si.photo_urls ?? [];
      for (let i = 0; i < photoUrls.length && i < PHOTO_SLOTS.length; i++) {
        db.insert(photos)
          .values({
            id: Crypto.randomUUID(),
            itemId: localId,
            // Store the Supabase public URL as the localUri — the photo
            // is remote, not cached locally. This works for display but
            // requires network. A future enhancement could download to cache.
            localUri: photoUrls[i],
            type: PHOTO_SLOTS[i],
          })
          .run();
      }

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
