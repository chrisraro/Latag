/** Pure overview math for the Home screen — snapshot figures, recent strip, next run.
 *  No db, no formatting: money stays a number and the screen formats it. Nothing mutates its input. */

/** Structural shape of an inventory row — deliberately not the drizzle type, so this stays pure. */
export type OverviewItem = {
  status: "available" | "sold";
  targetSellPrice: number;
  soldPrice: number | null;
  individualCost: number;
  soldAt: Date | null;
  createdAt: Date;
};

export type Snapshot = {
  /** Sum of targetSellPrice across items still available. */
  stockValue: number;
  itemsAvailable: number;
  /** Items sold in the rolling 7 days up to and including now. */
  soldThisWeek: number;
  /** Sum of (soldPrice − individualCost) for items sold in the calendar month of `now`. */
  profitThisMonth: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function snapshot(items: OverviewItem[], now: Date): Snapshot {
  const nowMs = now.getTime();
  const weekAgoMs = nowMs - WEEK_MS;
  const month = now.getMonth();
  const year = now.getFullYear();

  let stockValue = 0;
  let itemsAvailable = 0;
  let soldThisWeek = 0;
  let profitThisMonth = 0;

  for (const item of items) {
    if (item.status === "available") {
      stockValue += item.targetSellPrice;
      itemsAvailable += 1;
      continue;
    }
    if (item.status !== "sold" || !item.soldAt) continue;

    const soldMs = item.soldAt.getTime();
    if (soldMs <= nowMs && soldMs >= weekAgoMs) soldThisWeek += 1;
    // A sale with no recorded price contributes nothing rather than a negative cost.
    if (item.soldPrice === null) continue;
    if (item.soldAt.getMonth() === month && item.soldAt.getFullYear() === year) {
      profitThisMonth += item.soldPrice - item.individualCost;
    }
  }

  return { stockValue, itemsAvailable, soldThisWeek, profitThisMonth };
}

/** Newest-first copy of `items`, capped at `limit` (default 8). Input array is never sorted in place. */
export function recentItems<T extends { createdAt: Date }>(items: T[], limit = 8): T[] {
  return [...items]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, Math.max(0, limit));
}

/** The soonest strictly-future scheduled session, or null when nothing is scheduled ahead. */
export function nextScheduled<T extends { scheduledAt: Date | null }>(sessions: T[], now: Date): T | null {
  const nowMs = now.getTime();
  let best: T | null = null;
  let bestMs = Infinity;
  for (const session of sessions) {
    if (!session.scheduledAt) continue;
    const ms = session.scheduledAt.getTime();
    if (ms <= nowMs || ms >= bestMs) continue;
    best = session;
    bestMs = ms;
  }
  return best;
}
