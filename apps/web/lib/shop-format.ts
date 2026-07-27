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
  "code" | "brand" | "name" | "department" | "category" | "condition" | "specs" | "price" | "status" | "photo_urls"
>;

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
