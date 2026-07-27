import { filterItems, inventoryTotals, DEFAULT_FILTER } from "../lib/inventory";

const it0 = (over: Partial<Parameters<typeof filterItems>[0][number]> = {}) => ({
  brand: "Carhartt", name: null, department: "tops", category: "Jacket",
  status: "available" as const, targetSellPrice: 850, soldPrice: null,
  sessionId: "s1" as string | null,
  createdAt: new Date("2026-07-01T00:00:00Z"), ...over,
});

test("empty query returns everything", () => {
  const rows = [it0(), it0({ brand: "Nike" })];
  expect(filterItems(rows, DEFAULT_FILTER)).toHaveLength(2);
});

test("query matches brand, name, and category case-insensitively", () => {
  const rows = [it0(), it0({ brand: "Nike", name: "Windbreaker" }), it0({ brand: "Levi's", category: "Jeans" })];
  expect(filterItems(rows, { ...DEFAULT_FILTER, query: "car" })[0].brand).toBe("Carhartt");
  expect(filterItems(rows, { ...DEFAULT_FILTER, query: "wind" })[0].brand).toBe("Nike");
  expect(filterItems(rows, { ...DEFAULT_FILTER, query: "JEANS" })[0].brand).toBe("Levi's");
  expect(filterItems(rows, { ...DEFAULT_FILTER, query: "  " })).toHaveLength(3);
});

test("department and status filters", () => {
  const rows = [it0(), it0({ department: "footwear" }), it0({ status: "sold", soldPrice: 700 })];
  expect(filterItems(rows, { ...DEFAULT_FILTER, department: "footwear" })).toHaveLength(1);
  expect(filterItems(rows, { ...DEFAULT_FILTER, status: "sold" })).toHaveLength(1);
  expect(filterItems(rows, { ...DEFAULT_FILTER, status: "available" })).toHaveLength(2);
});

test("the batch facet defaults to all and narrows to loose items only", () => {
  const rows = [it0({ brand: "In batch" }), it0({ brand: "Loose", sessionId: null })];
  expect(filterItems(rows, DEFAULT_FILTER)).toHaveLength(2);
  expect(filterItems(rows, { ...DEFAULT_FILTER, batch: "none" }).map((r) => r.brand)).toEqual(["Loose"]);
});

test("the batch facet composes with the other facets", () => {
  const rows = [
    it0({ brand: "Loose tee", sessionId: null }),
    it0({ brand: "Loose jeans", sessionId: null, department: "bottoms" }),
    it0({ brand: "Batched jeans", department: "bottoms" }),
  ];
  expect(
    filterItems(rows, { ...DEFAULT_FILTER, batch: "none", department: "bottoms" }).map((r) => r.brand),
  ).toEqual(["Loose jeans"]);
});

test("price sorts use the effective price (soldPrice wins when sold)", () => {
  const rows = [
    it0({ brand: "A", targetSellPrice: 500 }),
    it0({ brand: "B", targetSellPrice: 900, status: "sold", soldPrice: 100 }),
    it0({ brand: "C", targetSellPrice: 700 }),
  ];
  expect(filterItems(rows, { ...DEFAULT_FILTER, sort: "price-high" }).map((r) => r.brand)).toEqual(["C", "A", "B"]);
  expect(filterItems(rows, { ...DEFAULT_FILTER, sort: "price-low" }).map((r) => r.brand)).toEqual(["B", "A", "C"]);
});

test("date sorts", () => {
  const rows = [
    it0({ brand: "old", createdAt: new Date("2026-01-01") }),
    it0({ brand: "new", createdAt: new Date("2026-07-01") }),
  ];
  expect(filterItems(rows, { ...DEFAULT_FILTER, sort: "newest" })[0].brand).toBe("new");
  expect(filterItems(rows, { ...DEFAULT_FILTER, sort: "oldest" })[0].brand).toBe("old");
});

test("does not mutate the input array", () => {
  const rows = [it0({ brand: "A" }), it0({ brand: "B", createdAt: new Date("2026-01-01") })];
  const snapshot = rows.map((r) => r.brand);
  filterItems(rows, { ...DEFAULT_FILTER, sort: "oldest" });
  expect(rows.map((r) => r.brand)).toEqual(snapshot);
});

test("totals: counts and stock value of AVAILABLE only", () => {
  const rows = [it0({ targetSellPrice: 500 }), it0({ targetSellPrice: 300 }),
                it0({ status: "sold", soldPrice: 900, targetSellPrice: 1000 })];
  expect(inventoryTotals(rows)).toEqual({ count: 3, available: 2, sold: 1, stockValue: 800 });
});

test("totals on an empty list", () => {
  expect(inventoryTotals([])).toEqual({ count: 0, available: 0, sold: 0, stockValue: 0 });
});
