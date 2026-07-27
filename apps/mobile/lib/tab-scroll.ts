/** Re-tapping the active tab is expected to return that tab's list to the top.
 *  The tab bar has no access to the screens' list refs, so each tab screen
 *  registers a callback here and the bar asks the registry by route name.
 *  Deliberately module-level: exactly one tab bar and one instance of each tab
 *  screen exist at a time. */
import { useEffect, useRef } from "react";

/** Return `false` when there was nothing to scroll — an empty state, or a list
 *  that isn't mounted in the tab's current state. Anything else counts as done. */
type ScrollToTop = () => boolean | void;

const handlers = new Map<string, ScrollToTop>();

/** Registers `fn` for `route` and returns its unregister. The unregister is
 *  identity-checked so a slow unmount can't evict the screen that replaced it. */
export function registerTabScroll(route: string, fn: ScrollToTop): () => void {
  handlers.set(route, fn);
  return () => {
    if (handlers.get(route) === fn) handlers.delete(route);
  };
}

/** Runs the route's handler. Returns whether anything actually happened — the
 *  caller uses that to decide if the tap earned feedback. A screen that is
 *  mounted but has no list (an empty state) is a legitimate `false`. */
export function scrollTabToTop(route: string): boolean {
  const fn = handlers.get(route);
  if (!fn) return false;
  try {
    return fn() !== false;
  } catch {
    // A torn-down list ref must never turn a tab tap into a crash.
    return false;
  }
}

/** Hook form for tab screens. `scroll` may change identity between renders —
 *  the registration itself stays stable so a re-render never drops it. */
export function useTabScrollToTop(route: string, scroll: ScrollToTop): void {
  const latest = useRef(scroll);
  useEffect(() => { latest.current = scroll; });
  useEffect(() => registerTabScroll(route, () => latest.current()), [route]);
}
