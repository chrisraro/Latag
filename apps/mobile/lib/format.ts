export function formatPeso(n: number): string {
  const r = Math.round(n);
  const sign = r < 0 ? "-" : "";
  return `${sign}₱${Math.abs(r).toLocaleString("en-PH")}`;
}
export function formatInches(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}"`;
}
export function formatPct(n: number): string {
  return `${Math.round(n)}%`;
}
