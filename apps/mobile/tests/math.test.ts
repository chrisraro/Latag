import { selectorProjected, selectorRealized, bultoProjectedPct, bultoRealizedPct, soldRevenue } from "../lib/math";

const it = (t: number, c = 0, sold?: number) =>
  ({ targetSellPrice: t, individualCost: c, soldPrice: sold ?? null, status: (sold != null ? "sold" : "available") as "sold" | "available" });

test("empty session → zeros", () => {
  expect(selectorProjected([])).toBe(0);
  expect(selectorRealized([])).toBe(0);
});
test("selector projected = Σtarget − Σcost over ALL items", () =>
  expect(selectorProjected([it(550, 100), it(400, 80, 380)])).toBe(550 + 400 - 100 - 80));
test("selector realized = Σsold − Σcost over SOLD only; below-cost goes negative", () => {
  expect(selectorRealized([it(550, 100), it(400, 80, 380)])).toBe(380 - 80);
  expect(selectorRealized([it(400, 500, 450)])).toBe(-50);
});
test("bulto recovery pcts; zero bale → null", () => {
  const items = [it(350), it(480, 0, 500), it(150)];
  expect(bultoProjectedPct(items, 10000)).toBeCloseTo(((350 + 480 + 150) / 10000) * 100);
  expect(bultoRealizedPct(items, 10000)).toBeCloseTo((500 / 10000) * 100);
  expect(bultoProjectedPct(items, 0)).toBeNull();
  expect(bultoRealizedPct(items, 0)).toBeNull();
});
test("soldRevenue sums soldPrice of sold items", () =>
  expect(soldRevenue([it(550, 0, 500), it(300)])).toBe(500));
