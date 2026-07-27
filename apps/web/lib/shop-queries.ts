import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Database } from "./supabase/types";
import type { ShopHeader, ShopItem } from "./shop-format";

/**
 * Read-side of the public storefront.
 *
 * Deliberately NOT `lib/supabase/server.ts`: that client reads `cookies()`, and
 * touching cookies opts a route out of static rendering — the shop pages would
 * lose their ISR cache and hit Postgres on every buyer scroll. Storefront data
 * is public by RLS (`shops.is_published`, and `shop_items` visible only when the
 * parent shop is published and the item is available or the shop shows sold), so
 * the anon key with no session is both sufficient and correct here.
 *
 * Every export is wrapped in React `cache` so `generateMetadata`, the page and
 * the OG route share one round trip per request instead of three.
 *
 * Nothing in this file can reach cost, profit, location or batch data: those
 * columns do not exist on `shop_items`.
 */
function publicSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export type { ShopHeader, ShopItem };

const SHOP_COLUMNS =
  "id, handle, display_name, bio, contact_messenger, contact_instagram, contact_email";
const ITEM_COLUMNS =
  "code, brand, name, department, category, condition, specs, price, status, photo_urls";

/** Handles are citext and lowercase by construction; normalize so a shared link
 *  with stray casing or whitespace still resolves. */
function normalizeHandle(handle: string): string {
  return decodeURIComponent(handle).trim().toLowerCase();
}

/** Item slugs are the permanent `LT-XXXXX` code, which is stored uppercase. */
function normalizeCode(code: string): string {
  return decodeURIComponent(code).trim().toUpperCase();
}

export const getShop = cache(async (handle: string): Promise<ShopHeader | null> => {
  const { data, error } = await publicSupabase()
    .from("shops")
    .select(SHOP_COLUMNS)
    .eq("handle", normalizeHandle(handle))
    .maybeSingle();

  if (error || !data) return null;
  return data as ShopHeader;
});

/**
 * Sold items are filtered by RLS, not here — a shop with `show_sold` off simply
 * never returns them. Ordering mirrors the mobile `sortOrder` (publish time),
 * newest first, with `code` as a stable tiebreaker so the grid doesn't reshuffle
 * between revalidations.
 */
export const getShopItems = cache(async (shopId: string): Promise<ShopItem[]> => {
  const { data, error } = await publicSupabase()
    .from("shop_items")
    .select(ITEM_COLUMNS)
    .eq("shop_id", shopId)
    .order("sort_order", { ascending: false })
    .order("code", { ascending: true });

  if (error || !data) return [];
  return data as ShopItem[];
});

export const getShopItem = cache(
  async (shopId: string, code: string): Promise<ShopItem | null> => {
    const { data, error } = await publicSupabase()
      .from("shop_items")
      .select(ITEM_COLUMNS)
      .eq("shop_id", shopId)
      .eq("code", normalizeCode(code))
      .maybeSingle();

    if (error || !data) return null;
    return data as ShopItem;
  }
);

/** The shop page and its OG card both want the pair. */
export const getShopWithItems = cache(
  async (handle: string): Promise<{ shop: ShopHeader; items: ShopItem[] } | null> => {
    const shop = await getShop(handle);
    if (!shop) return null;
    return { shop, items: await getShopItems(shop.id) };
  }
);

/** Hard cap so one prolific seller can't produce an unservable sitemap. */
const SITEMAP_ITEM_LIMIT = 5000;

export type SitemapEntry = { path: string; lastModified: Date };

/**
 * Every publicly visible storefront URL. Failures return an empty list rather
 * than throwing: a sitemap is a nice-to-have and must never fail a build or a
 * request. RLS already limits this to published shops and visible items.
 */
export async function listStorefrontUrls(): Promise<SitemapEntry[]> {
  try {
    const db = publicSupabase();
    const { data: shops } = await db.from("shops").select("id, handle, updated_at");
    if (!shops || shops.length === 0) return [];

    const byId = new Map(shops.map((s) => [s.id, s.handle]));
    const entries: SitemapEntry[] = shops.map((s) => ({
      path: `/shop/${s.handle}`,
      lastModified: new Date(s.updated_at),
    }));

    const { data: items } = await db
      .from("shop_items")
      .select("shop_id, code, updated_at")
      .order("updated_at", { ascending: false })
      .limit(SITEMAP_ITEM_LIMIT);

    for (const item of items ?? []) {
      const handle = byId.get(item.shop_id);
      if (!handle) continue;
      entries.push({
        path: `/shop/${handle}/${item.code}`,
        lastModified: new Date(item.updated_at),
      });
    }

    return entries;
  } catch {
    return [];
  }
}
