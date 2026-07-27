import { snapshot, recentItems, nextScheduled } from "../lib/overview";

const NOW = new Date("2026-07-27T12:00:00Z");
const it0 = (over: Partial<Parameters<typeof snapshot>[0][number]> = {}) => ({
  status: "available" as const, targetSellPrice: 500, soldPrice: null,
  individualCost: 100, soldAt: null, createdAt: new Date("2026-07-01T00:00:00Z"), ...over,
});

test("stock value and availability count only available items", () => {
  const s = snapshot([it0({ targetSellPrice: 500 }), it0({ targetSellPrice: 300 }),
                      it0({ status: "sold", soldPrice: 900, soldAt: NOW })], NOW);
  expect(s.stockValue).toBe(800);
  expect(s.itemsAvailable).toBe(2);
});

test("sold this week is a rolling 7 days", () => {
  const s = snapshot([
    it0({ status: "sold", soldPrice: 400, soldAt: new Date("2026-07-26T00:00:00Z") }),
    it0({ status: "sold", soldPrice: 400, soldAt: new Date("2026-07-19T00:00:00Z") }), // 8 days -> out
  ], NOW);
  expect(s.soldThisWeek).toBe(1);
});

test("profit this month is calendar-month and nets out cost", () => {
  const s = snapshot([
    it0({ status: "sold", soldPrice: 900, individualCost: 100, soldAt: new Date("2026-07-05T00:00:00Z") }),
    it0({ status: "sold", soldPrice: 500, individualCost: 200, soldAt: new Date("2026-06-30T00:00:00Z") }), // last month
  ], NOW);
  expect(s.profitThisMonth).toBe(800);
});

test("a sold item with no recorded price contributes no profit", () => {
  expect(snapshot([it0({ status: "sold", soldPrice: null, individualCost: 100, soldAt: NOW })], NOW).profitThisMonth).toBe(0);
});

test("empty inventory is all zeroes, not NaN", () => {
  expect(snapshot([], NOW)).toEqual({ stockValue: 0, itemsAvailable: 0, soldThisWeek: 0, profitThisMonth: 0 });
});

test("recentItems is newest-first, capped, and does not mutate", () => {
  const rows = [it0({ createdAt: new Date("2026-01-01") }), it0({ createdAt: new Date("2026-07-01") })];
  const snap = rows.map((r) => r.createdAt.getTime());
  expect(recentItems(rows, 1)[0].createdAt.toISOString()).toContain("2026-07-01");
  expect(rows.map((r) => r.createdAt.getTime())).toEqual(snap);
});

test("nextScheduled picks the soonest future run and ignores past ones", () => {
  const past = { scheduledAt: new Date("2026-07-20T00:00:00Z") };
  const soon = { scheduledAt: new Date("2026-07-28T00:00:00Z") };
  const later = { scheduledAt: new Date("2026-08-10T00:00:00Z") };
  expect(nextScheduled([later, past, soon], NOW)).toBe(soon);
  expect(nextScheduled([past], NOW)).toBeNull();
  expect(nextScheduled([{ scheduledAt: null }], NOW)).toBeNull();
});
