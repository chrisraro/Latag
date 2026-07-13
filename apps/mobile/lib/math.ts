type MoneyItem = { targetSellPrice: number; individualCost: number; soldPrice: number | null; status: "available" | "sold" };

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const sold = (items: MoneyItem[]) => items.filter((i) => i.status === "sold");

export function selectorProjected(items: MoneyItem[]): number {
  return sum(items.map((i) => i.targetSellPrice)) - sum(items.map((i) => i.individualCost));
}
export function selectorRealized(items: MoneyItem[]): number {
  const s = sold(items);
  return sum(s.map((i) => i.soldPrice ?? 0)) - sum(s.map((i) => i.individualCost));
}
export function soldRevenue(items: MoneyItem[]): number {
  return sum(sold(items).map((i) => i.soldPrice ?? 0));
}
export function bultoProjectedPct(items: MoneyItem[], baleCost: number): number | null {
  if (baleCost <= 0) return null;
  return (sum(items.map((i) => i.targetSellPrice)) / baleCost) * 100;
}
export function bultoRealizedPct(items: MoneyItem[], baleCost: number): number | null {
  if (baleCost <= 0) return null;
  return (soldRevenue(items) / baleCost) * 100;
}
