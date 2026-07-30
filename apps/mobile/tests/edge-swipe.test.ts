import { TAB_DESTINATIONS } from "../components/FloatingTabBar";
import {
  EDGE_WIDTH,
  MIN_TRANSLATION,
  edgeSwipeDirection,
  neighborTabRoute,
  pathnameFromRouteName,
  resolveEdgeSwipeTarget,
  routeNameFromPathname,
} from "../lib/edge-swipe";

const SCREEN_WIDTH = 390;

// ---------------------------------------------------------------------------
// edgeSwipeDirection — the recognizer's decision, in isolation
// ---------------------------------------------------------------------------

test("an edge-origin horizontal pan from the left, dragging right, resolves to back", () => {
  expect(
    edgeSwipeDirection({ startX: 10, translationX: 150, translationY: 0 }, SCREEN_WIDTH),
  ).toBe("back");
});

test("an edge-origin horizontal pan from the right, dragging left, resolves to forward", () => {
  expect(
    edgeSwipeDirection({ startX: SCREEN_WIDTH - 5, translationX: -150, translationY: 0 }, SCREEN_WIDTH),
  ).toBe("forward");
});

test("a pan starting mid-screen does not resolve, however far it travels", () => {
  expect(
    edgeSwipeDirection({ startX: SCREEN_WIDTH / 2, translationX: 150, translationY: 0 }, SCREEN_WIDTH),
  ).toBeNull();
  expect(
    edgeSwipeDirection({ startX: SCREEN_WIDTH / 2, translationX: -150, translationY: 0 }, SCREEN_WIDTH),
  ).toBeNull();
});

test("a mostly-vertical drag from the edge does not resolve", () => {
  // translationX exceeds the edge/flick minimum on its own, but translationY
  // is more than half of it — dominance fails.
  expect(
    edgeSwipeDirection({ startX: 5, translationX: 70, translationY: 100 }, SCREEN_WIDTH),
  ).toBeNull();
});

test("a short nudge from the edge does not resolve — it must clear the flick minimum", () => {
  expect(
    edgeSwipeDirection({ startX: 5, translationX: MIN_TRANSLATION - 1, translationY: 0 }, SCREEN_WIDTH),
  ).toBeNull();
});

test("a pan dragging the wrong way off an edge does not resolve", () => {
  // Left edge, dragging further left (off-screen) — not the back gesture.
  expect(
    edgeSwipeDirection({ startX: 5, translationX: -150, translationY: 0 }, SCREEN_WIDTH),
  ).toBeNull();
  // Right edge, dragging further right — not the forward gesture.
  expect(
    edgeSwipeDirection({ startX: SCREEN_WIDTH - 5, translationX: 150, translationY: 0 }, SCREEN_WIDTH),
  ).toBeNull();
});

test("the edge band is exactly EDGE_WIDTH wide", () => {
  expect(
    edgeSwipeDirection({ startX: EDGE_WIDTH, translationX: 150, translationY: 0 }, SCREEN_WIDTH),
  ).toBe("back");
  expect(
    edgeSwipeDirection({ startX: EDGE_WIDTH + 1, translationX: 150, translationY: 0 }, SCREEN_WIDTH),
  ).toBeNull();
});

// ---------------------------------------------------------------------------
// neighborTabRoute — walking TAB_DESTINATIONS, never hardcoded route names
// ---------------------------------------------------------------------------

test("forward moves through TAB_DESTINATIONS in order, from every position but the last", () => {
  for (let i = 0; i < TAB_DESTINATIONS.length - 1; i++) {
    expect(neighborTabRoute(TAB_DESTINATIONS[i], "forward")).toBe(TAB_DESTINATIONS[i + 1]);
  }
});

test("back moves through TAB_DESTINATIONS in reverse, from every position but the first", () => {
  for (let i = 1; i < TAB_DESTINATIONS.length; i++) {
    expect(neighborTabRoute(TAB_DESTINATIONS[i], "back")).toBe(TAB_DESTINATIONS[i - 1]);
  }
});

test("the ends do not navigate out of bounds — no wraparound either direction", () => {
  expect(neighborTabRoute(TAB_DESTINATIONS[0], "back")).toBeNull();
  expect(neighborTabRoute(TAB_DESTINATIONS[TAB_DESTINATIONS.length - 1], "forward")).toBeNull();
});

test("a route outside the bar's allowlist (e.g. Settings) has no neighbour either way", () => {
  expect(neighborTabRoute("settings", "forward")).toBeNull();
  expect(neighborTabRoute("settings", "back")).toBeNull();
});

// ---------------------------------------------------------------------------
// resolveEdgeSwipeTarget — the end-to-end decision the gesture handler calls
// ---------------------------------------------------------------------------

test("resolveEdgeSwipeTarget composes recognition and neighbour lookup", () => {
  expect(
    resolveEdgeSwipeTarget({ startX: 5, translationX: 150, translationY: 0 }, SCREEN_WIDTH, TAB_DESTINATIONS[1]),
  ).toBe(TAB_DESTINATIONS[0]);
  expect(
    resolveEdgeSwipeTarget(
      { startX: SCREEN_WIDTH - 5, translationX: -150, translationY: 0 },
      SCREEN_WIDTH,
      TAB_DESTINATIONS[1],
    ),
  ).toBe(TAB_DESTINATIONS[2]);
});

test("resolveEdgeSwipeTarget is null when the swipe doesn't qualify, even at a valid tab", () => {
  expect(
    resolveEdgeSwipeTarget(
      { startX: SCREEN_WIDTH / 2, translationX: 150, translationY: 0 },
      SCREEN_WIDTH,
      TAB_DESTINATIONS[1],
    ),
  ).toBeNull();
});

test("resolveEdgeSwipeTarget is null when the swipe qualifies but the tab is at an end", () => {
  expect(
    resolveEdgeSwipeTarget(
      { startX: 5, translationX: 150, translationY: 0 },
      SCREEN_WIDTH,
      TAB_DESTINATIONS[0],
    ),
  ).toBeNull();
  expect(
    resolveEdgeSwipeTarget(
      { startX: SCREEN_WIDTH - 5, translationX: -150, translationY: 0 },
      SCREEN_WIDTH,
      TAB_DESTINATIONS[TAB_DESTINATIONS.length - 1],
    ),
  ).toBeNull();
});

// ---------------------------------------------------------------------------
// pathname <-> route name — expo-router's "/" for index, "/name" otherwise
// ---------------------------------------------------------------------------

test("routeNameFromPathname maps the tabs root to the index route name", () => {
  expect(routeNameFromPathname("/")).toBe("index");
});

test("routeNameFromPathname strips the leading slash for every other tab", () => {
  expect(routeNameFromPathname("/inventory")).toBe("inventory");
  expect(routeNameFromPathname("/batches")).toBe("batches");
  expect(routeNameFromPathname("/shop")).toBe("shop");
});

test("pathnameFromRouteName round-trips for every bar destination", () => {
  for (const name of TAB_DESTINATIONS) {
    expect(routeNameFromPathname(pathnameFromRouteName(name))).toBe(name);
  }
});
