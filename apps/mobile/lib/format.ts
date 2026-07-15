export function formatPeso(n: number): string {
  const r = Math.round(n);
  const sign = r < 0 ? "-" : "";
  return `${sign}₱${Math.abs(r).toLocaleString("en-PH")}`;
}

/** Symbol/amount split for Money's nested-Text currency scale (₱ smaller than digits). */
export function formatPesoParts(n: number): { symbol: "₱"; amount: string } {
  const r = Math.round(n);
  const sign = r < 0 ? "-" : "";
  return { symbol: "₱", amount: `${sign}${Math.abs(r).toLocaleString("en-PH")}` };
}
export function formatInches(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}"`;
}
export function formatPct(n: number): string {
  return `${Math.round(n)}%`;
}

/** "0:45" mm:ss style countdown for the OTP resend timer. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}
