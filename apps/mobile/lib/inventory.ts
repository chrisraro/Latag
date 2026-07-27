import type { Department } from "./catalog";

/** Status facet for the inventory list — `all` skips the filter. */
export type InvStatus = "all" | "available" | "sold";

/** Sort modes the inventory sort chip cycles through. */
export type InvSort = "newest" | "oldest" | "price-high" | "price-low";

/** The complete filter state of the Inventory screen. */
export type InvFilter = {
  query: string;
  department: Department | "all";
  status: InvStatus;
  sort: InvSort;
};

/**
 * Structural minimum these helpers need from an item row — deliberately NOT the
 * drizzle row type, so the module stays pure and testable without the db.
 */
type InvItem = {
  brand: string;
  name: string | null;
  department: string;
  category: string;
  status: "available" | "sold";
  targetSellPrice: number;
  soldPrice: number | null;
  createdAt: Date;
};

export const DEFAULT_FILTER: InvFilter = {
  query: "",
  department: "all",
  status: "all",
  sort: "newest",
};

/** What a row is worth right now: the realized price once sold, else the ask. */
const effectivePrice = (i: InvItem) => (i.status === "sold" ? i.soldPrice ?? i.targetSellPrice : i.targetSellPrice);

const matchesQuery = (i: InvItem, needle: string) =>
  i.brand.toLowerCase().includes(needle) ||
  (i.name ?? "").toLowerCase().includes(needle) ||
  i.category.toLowerCase().includes(needle);

/**
 * Filters then sorts a list of items. Never mutates the input array; the sort is
 * stable, so rows that tie keep their incoming order.
 */
export function filterItems<T extends InvItem>(items: T[], f: InvFilter): T[] {
  const needle = f.query.trim().toLowerCase();
  const filtered = items.filter(
    (i) =>
      (needle === "" || matchesQuery(i, needle)) &&
      (f.department === "all" || i.department === f.department) &&
      (f.status === "all" || i.status === f.status),
  );
  return filtered.sort((a, b) => {
    switch (f.sort) {
      case "newest":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "oldest":
        return a.createdAt.getTime() - b.createdAt.getTime();
      case "price-high":
        return effectivePrice(b) - effectivePrice(a);
      case "price-low":
        return effectivePrice(a) - effectivePrice(b);
    }
  });
}

/**
 * Headline numbers for the totals strip. `stockValue` counts only what is still
 * on the shelf — sold rows have already left it.
 */
export function inventoryTotals<T extends InvItem>(
  items: T[],
): { count: number; available: number; sold: number; stockValue: number } {
  let available = 0;
  let sold = 0;
  let stockValue = 0;
  for (const i of items) {
    if (i.status === "sold") sold += 1;
    else {
      available += 1;
      stockValue += i.targetSellPrice;
    }
  }
  return { count: items.length, available, sold, stockValue };
}
