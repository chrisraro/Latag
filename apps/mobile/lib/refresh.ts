import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS } from "./theme";

/**
 * Pull-to-refresh for an offline-first app.
 *
 * There is no server to be the source of truth here: every figure on every tab
 * is already derived from local SQLite through a live query. So "refresh" means
 * two honest things and nothing more — re-run the local reads, and nudge the
 * publish outbox for sellers who have a shop. Both work in airplane mode; the
 * queue drain simply finds nothing it can send and leaves the rows alone.
 *
 * The hook owns only the mechanics a `RefreshControl` needs: one in-flight
 * refresh at a time, and a flag that always comes back down. A pull that leaves
 * the spinner stuck is worse than no pull at all, so the callback's failure —
 * thrown synchronously or rejected later — is swallowed here rather than left
 * to each screen to remember.
 */

/**
 * A local re-read completes in the same frame, so without a floor the spinner
 * appears and vanishes before the finger has left the glass and the pull reads
 * as broken. Long enough to register as an answer, short enough that no one is
 * ever waiting on it. Screens compose it *alongside* their work (`Promise.all`),
 * never after it — this is a minimum, not an added delay.
 */
export const MIN_REFRESH_MS = 400;

export function settle(ms: number = MIN_REFRESH_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * The spinner in Warehouse Console colours, spread onto every `RefreshControl`
 * in the app. iOS reads `tintColor`; Android draws `colors` on a disc filled
 * with `progressBackgroundColor` — leaving that unset paints stock white on a
 * black screen.
 */
export const REFRESH_TINT: { tintColor: string; colors: string[]; progressBackgroundColor: string } = {
  tintColor: COLORS.acid,
  colors: [COLORS.acid],
  progressBackgroundColor: COLORS.surface1,
};

export type Refresh = {
  /** Drives `RefreshControl`'s `refreshing`. */
  refreshing: boolean;
  /** Drives `RefreshControl`'s `onRefresh`. Safe to fire repeatedly. */
  onRefresh: () => void;
};

/**
 * `onRefresh` may change identity every render (screens build it from live
 * query results); the returned handler is stable and always calls the newest
 * one, so a `RefreshControl` never re-mounts mid-gesture.
 */
export function useRefresh(onRefresh: () => Promise<void>): Refresh {
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false); // the guard, not the flag: it is read synchronously
  const mounted = useRef(true);
  const latest = useRef(onRefresh);

  useEffect(() => { latest.current = onRefresh; });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(() => {
    // A pull-down can fire again while the last one is still working (a second
    // tug, or a focus-triggered call landing on top). Running the callback
    // twice would double the queue drain for no gain.
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);

    const done = () => {
      busy.current = false;
      // Backgrounded or navigated away mid-refresh: the screen is gone and
      // there is no spinner left to lower.
      if (mounted.current) setRefreshing(false);
    };

    let work: Promise<void> | void;
    try {
      work = latest.current();
    } catch {
      done();
      return;
    }
    Promise.resolve(work).then(done, done);
  }, []);

  return { refreshing, onRefresh: run };
}
