/** Pure schedule math for Sessions 2.0 — reminder times, countdowns, stamps.
 *  Hermes-safe: no Intl; stamps built manually from day/month name arrays. */

export const REMINDER_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "At time" },
  { minutes: 30, label: "30 min before" },
  { minutes: 60, label: "1 hr before" },
  { minutes: 1440, label: "1 day before" },
];

const MIN_MS = 60_000;

/** scheduledAt − offset for each offset, strictly future (> now), sorted asc, deduped. */
export function reminderTimes(scheduledAt: Date, offsetsMinutes: number[], now: Date): Date[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const offset of offsetsMinutes) {
    const t = scheduledAt.getTime() - offset * MIN_MS;
    if (t > now.getTime() && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  out.sort((a, b) => a - b);
  return out.map((t) => new Date(t));
}

/** Tolerant JSON-array-of-minutes parser: null/invalid/non-array → []; non-number entries dropped. */
export function parseOffsets(json: string | null): number[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  } catch {
    return [];
  }
}

/** "in 3d 4h" / "in 2h 15m" / "in 45m" / "now" (past or <1 min away → "now"). */
export function formatCountdown(scheduledAt: Date, now: Date): string {
  const totalMin = Math.floor((scheduledAt.getTime() - now.getTime()) / MIN_MS);
  if (totalMin < 1) return "now";
  if (totalMin >= 48 * 60) {
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    return h > 0 ? `in ${d}d ${h}h` : `in ${d}d`;
  }
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  }
  return `in ${totalMin}m`;
}

/** Soonest-first sort key; sessions without a schedule sort last. */
export function scheduleSortKey(s: { scheduledAt: Date | null }): number {
  return s.scheduledAt ? s.scheduledAt.getTime() : Number.MAX_SAFE_INTEGER;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat · Jul 18 · 6:30 AM" — local time, 12-hour, no seconds. */
export function formatScheduleStamp(d: Date): string {
  const h24 = d.getHours();
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()} · ${h12}:${mm} ${period}`;
}
