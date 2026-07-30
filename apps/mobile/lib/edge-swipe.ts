import { TAB_DESTINATIONS } from "../components/FloatingTabBar";

/**
 * Edge-swipe between tabs — the decision logic only.
 *
 * ## Why this is pure
 *
 * `components/EdgeSwipeNav.tsx` wires this into `react-native-gesture-handler`'s
 * `Gesture.Pan()`, but nothing in this module touches a native module, and
 * nothing here is a worklet. That split exists so the four behaviours the
 * feature promises — edge-origin fires, mid-screen doesn't, a vertical drag
 * doesn't, the ends don't wrap — are ordinary Jest assertions instead of
 * something that can only be checked by hand on a device.
 *
 * ## Why no finger-tracked page translation
 *
 * That needs Reanimated's worklet runtime, and `lib/native-ui.ts` keeps that
 * off until a native build proves it on a real device (see the 2026-07-27
 * postmortem there). This module only ever fires once, on release, and hands
 * the result to `router.navigate` — the same cross-fade the tab bar's own tap
 * already uses, nothing new to animate.
 */

/** How close to a screen edge a touch must start for the pan to be a candidate
 *  at all. Wide enough for a thumb, narrow enough to leave every other pixel —
 *  Home's "Recent items" strip, Inventory's filter chips, both FlashLists, and
 *  every screen's `RefreshControl` — untouched. */
export const EDGE_WIDTH = 24;

/** Minimum horizontal travel, in px, before a completed pan counts as a
 *  deliberate flick rather than a thumb resting near the edge. */
export const MIN_TRANSLATION = 60;

/** Horizontal travel must outpace vertical by at least this factor. Guards
 *  against a diagonal drag — someone nudging a list while their thumb also
 *  happens to start near the bezel — from being read as a tab switch. */
export const DOMINANCE_RATIO = 2;

export type EdgeSwipeSample = {
  /** x position, in the gesture's own view, where the touch began. */
  startX: number;
  /** Net horizontal travel from touch-down to release. */
  translationX: number;
  /** Net vertical travel from touch-down to release. */
  translationY: number;
};

/** `"back"` mirrors the OS-standard left-edge-drag-right gesture; `"forward"`
 *  is its mirror on the right edge. Named for intent, not screen side, since
 *  RTL layouts would flip which visual edge means which. */
export type EdgeSwipeDirection = "forward" | "back";

/**
 * Whether a completed pan qualifies as an edge swipe, and which way. `null`
 * covers every disqualifying case: started away from an edge, too short to be
 * a flick, mostly vertical, or dragging away from the screen rather than in
 * from it.
 */
export function edgeSwipeDirection(sample: EdgeSwipeSample, screenWidth: number): EdgeSwipeDirection | null {
  const { startX, translationX, translationY } = sample;

  if (Math.abs(translationX) < MIN_TRANSLATION) return null;
  if (Math.abs(translationX) < Math.abs(translationY) * DOMINANCE_RATIO) return null;

  const startedAtLeftEdge = startX <= EDGE_WIDTH;
  const startedAtRightEdge = startX >= screenWidth - EDGE_WIDTH;

  if (startedAtLeftEdge && translationX > 0) return "back";
  if (startedAtRightEdge && translationX < 0) return "forward";
  return null;
}

/**
 * The neighbouring bar destination in `direction`, or `null` at either end.
 * Deliberately does not wrap: `index` is the app's boot screen and `shop` is
 * the last destination the owner put on the bar, so a swipe wrapping `shop`
 * back to `index` (or vice-versa) would connect two tabs the bar itself never
 * treats as adjacent — worse, it would make the *same* gesture sometimes
 * advance one tab and sometimes jump three, depending only on which end you
 * started from. No-wrap keeps the gesture's meaning constant: one destination
 * over, in the bar's own order, or nothing.
 *
 * Reads `TAB_DESTINATIONS` directly (not a hardcoded route list) so this stays
 * correct if the bar's order or membership ever changes.
 */
export function neighborTabRoute(currentRoute: string, direction: EdgeSwipeDirection): string | null {
  const index = TAB_DESTINATIONS.indexOf(currentRoute as (typeof TAB_DESTINATIONS)[number]);
  if (index < 0) return null; // not one of the bar's destinations (e.g. Settings) — no-op
  const nextIndex = direction === "forward" ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= TAB_DESTINATIONS.length) return null;
  return TAB_DESTINATIONS[nextIndex];
}

/**
 * The full decision, start to finish: given a completed pan, the screen width
 * it happened on, and the tab it started from, the route to navigate to — or
 * `null` to do nothing. This is the one function `EdgeSwipeNav` calls.
 */
export function resolveEdgeSwipeTarget(
  sample: EdgeSwipeSample,
  screenWidth: number,
  currentRoute: string,
): string | null {
  const direction = edgeSwipeDirection(sample, screenWidth);
  return direction ? neighborTabRoute(currentRoute, direction) : null;
}

/**
 * `usePathname()` reports `"/"` for the tabs' `index` route and `"/name"` for
 * every other tab — expo-router omits the `(tabs)` group segment entirely.
 * This is the inverse of `pathnameFromRouteName`, kept as two small named
 * functions rather than one bidirectional map so each direction reads as
 * exactly what it does at the call site.
 */
export function routeNameFromPathname(pathname: string): string {
  const trimmed = pathname.replace(/^\/+/, "");
  return trimmed === "" ? "index" : trimmed;
}

/** The path `router.navigate` needs to reach a `TAB_DESTINATIONS` entry. */
export function pathnameFromRouteName(routeName: string): string {
  return routeName === "index" ? "/" : `/${routeName}`;
}
