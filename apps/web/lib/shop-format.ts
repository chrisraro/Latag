import type { ShopItemRow, ShopItemSpec, ShopRow } from "./supabase/types";

/**
 * Storefront display helpers and the shapes the pages render.
 *
 * Split out of `shop-queries.ts` deliberately: the item grid is a Client
 * Component, and importing these from the query module would drag the whole
 * Supabase SDK into the buyer's bundle for the sake of a peso sign.
 */

export type ShopHeader = Pick<
  ShopRow,
  "id" | "handle" | "display_name" | "bio" | "contact_messenger" | "contact_instagram" | "contact_email"
>;

export type ShopItem = Pick<
  ShopItemRow,
  | "code"
  | "brand"
  | "name"
  | "department"
  | "category"
  | "condition"
  | "specs"
  | "price"
  | "status"
  | "photo_urls"
  /** Never rendered. It is the cache key for the photos — see `itemPhotoUrls`. */
  | "updated_at"
>;

/**
 * Photo objects are written to deterministic paths (`{user}/{item}/{n}.jpg`)
 * with `upsert: true`, so re-shooting a photo replaces the bytes behind a URL
 * that never changes. Both the Supabase CDN and Next's image optimizer would
 * then keep serving the old shot for their full TTL, and the seller — who can
 * see the new photo on their phone — has no way to tell.
 *
 * `shop_items.updated_at` moves on every republish (the `touch_updated_at`
 * trigger fires on the upsert's UPDATE branch), which makes it the cheapest
 * honest signal that the bytes may have changed. Folding it into the query
 * string gives a URL that is stable while the item is, and new the moment it
 * is not — so caching still works, it just stops lying.
 *
 * NOTE: `next.config.ts` must NOT set `search: ""` on the remote pattern.
 * That value means "empty query string only" and would reject every URL below
 * with a 400. Pinned by `tests/photo-url.test.ts`.
 */
export function photoVersion(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null;
  const ms = Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return null;
  return ms.toString(36);
}

export function versionedPhotoUrl(url: string, updatedAt: string | null | undefined): string {
  const version = photoVersion(updatedAt);
  if (!url || !version) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

/** Every photo on an item, cache-busted, in the seller's order. */
export function itemPhotoUrls(
  item: Pick<ShopItem, "photo_urls" | "updated_at">
): string[] {
  return (item.photo_urls ?? []).map((url) => versionedPhotoUrl(url, item.updated_at));
}

/** Buyer-facing department labels; the DB stores the lowercase key. */
const DEPARTMENT_LABELS: Record<string, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  dresses: "Dresses",
  footwear: "Footwear",
  bags: "Bags",
  accessories: "Accessories",
};

export function departmentLabel(key: string): string {
  return DEPARTMENT_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Matches the app's own formatting so a price reads identically in both. */
export function formatPeso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString("en-PH")}`;
}

export function itemTitle(item: { brand: string; name: string | null }): string {
  const name = item.name?.trim();
  return name ? `${item.brand} ${name}` : item.brand;
}

/**
 * Normalizes `shop_items.specs` into ordered [key, value] pairs for display.
 *
 * The column is an ordered array of `{ k, v }` pairs so a seller's chosen
 * order (e.g. Waist before Inseam) survives to the storefront. Some rows may
 * still carry the legacy jsonb-object shape from before that migration —
 * those fall back to `Object.entries` (unordered) rather than crashing.
 */
export function specEntries(specs: ShopItemSpec[] | Record<string, string> | null | undefined): [string, string][] {
  if (!specs) return [];
  const pairs: [string, string][] = Array.isArray(specs)
    ? specs.map((s) => [s.k, s.v] as [string, string])
    : Object.entries(specs);
  return pairs.filter(([, v]) => typeof v === "string" && v.trim().length > 0);
}
