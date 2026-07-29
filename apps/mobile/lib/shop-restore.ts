import { eq } from "drizzle-orm";
import { items, photos, type Item } from "../db/schema";
import type { LatagDb } from "../db/client";
import { specRowsFor, SPEC_LABEL_TO_KEY, parseSpecValue, type CatalogItem, type SpecKey } from "./catalog";
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

type RestoreResult = { restored: number; skipped: number };

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
export async function restorePublishedItems(db: LatagDb): Promise<RestoreResult> {
  const result: RestoreResult = { restored: 0, skipped: 0 };

  try {
    // 1. Fetch all shop_items for the current user's shop
    const { data: shopItems, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .single();

    if (shopError || !shopItems) return result;

    const { data: items_data, error: itemsError } = await supabase
      .from("shop_items")
      .select("*")
      .eq("shop_id", shopItems.id)
      .order("sort_order", { ascending: false });

    if (itemsError || !items_data || items_data.length === 0) return result;

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
        result.skipped += 1;
        continue;
      }

      // 3. Parse specs back to individual columns
      const specs = parseSpecs(si.specs);

      // 4. Generate a new local ID (old item_local_id is meaningless now)
      const localId = crypto.randomUUID();

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
            id: crypto.randomUUID(),
            itemId: localId,
            // Store the Supabase public URL as the localUri — the photo
            // is remote, not cached locally. This works for display but
            // requires network. A future enhancement could download to cache.
            localUri: photoUrls[i],
            type: PHOTO_SLOTS[i],
          })
          .run();
      }

      result.restored += 1;
    }
  } catch {
    // Swallow errors — restore is best-effort and must never crash the app
  }

  return result;
}
