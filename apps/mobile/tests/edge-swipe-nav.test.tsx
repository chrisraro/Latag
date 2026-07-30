import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { Text } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";

const mockNavigate = jest.fn();
let mockPathname = "/inventory";
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  usePathname: () => mockPathname,
}));

import { EdgeSwipeNav } from "../components/EdgeSwipeNav";
import { EDGE_WIDTH } from "../lib/edge-swipe";

let tree: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = null;
  mockNavigate.mockClear();
  mockPathname = "/inventory";
});

function texts(t: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node === "string") { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk((node as { children?: unknown }).children);
  };
  walk(t.toJSON());
  return out;
}

test("renders its children unchanged — the gesture layer is invisible", () => {
  act(() => {
    tree = renderer.create(
      <EdgeSwipeNav>
        <Text>Inventory</Text>
      </EdgeSwipeNav>,
    );
  });
  expect(texts(tree!)).toContain("Inventory");
});

test("never navigates on its own — mounting does not call router.navigate", () => {
  act(() => {
    tree = renderer.create(
      <EdgeSwipeNav>
        <Text>Inventory</Text>
      </EdgeSwipeNav>,
    );
  });
  expect(mockNavigate).not.toHaveBeenCalled();
});

// A `Gesture.Pan()` with no activation criteria activates omnidirectionally
// after ~8dp of travel in ANY direction (RNGH's default shouldActivate is
// `distSq >= minDist²`) — so a vertical drag starting in the edge sliver
// would cancel the FlashList/RefreshControl underneath before the direction
// check in `onEnd` ever runs. `activeOffsetX` + `failOffsetY` are the only
// things that stop that: `failOffsetY` is evaluated before activation, so a
// vertical drag fails the gesture outright instead of racing it to `onEnd`.
test("both edge gestures declare axis-aware activation criteria, not just hitSlop", () => {
  act(() => {
    tree = renderer.create(
      <EdgeSwipeNav>
        <Text>Inventory</Text>
      </EdgeSwipeNav>,
    );
  });
  const detector = tree!.root.findByType(GestureDetector);
  // Gesture.Race(leftEdge, rightEdge) — `toGestureArray()` is RNGH's own way
  // to get back the underlying Pan gestures from a composed gesture.
  const gestures = (detector.props.gesture as { toGestureArray(): Array<{ config: Record<string, unknown> }> }).toGestureArray();
  expect(gestures).toHaveLength(2);
  for (const g of gestures) {
    expect(g.config.hitSlop).toBeTruthy();
    expect(g.config.runOnJS).toBe(true);
    // activeOffsetX([-15, 15])
    expect(g.config.activeOffsetXStart).toBe(-15);
    expect(g.config.activeOffsetXEnd).toBe(15);
    // failOffsetY([-15, 15])
    expect(g.config.failOffsetYStart).toBe(-15);
    expect(g.config.failOffsetYEnd).toBe(15);
  }
});

test("the edge hitSlop width matches EDGE_WIDTH (px-5, the tab screens' own edge padding)", () => {
  act(() => {
    tree = renderer.create(
      <EdgeSwipeNav>
        <Text>Inventory</Text>
      </EdgeSwipeNav>,
    );
  });
  const detector = tree!.root.findByType(GestureDetector);
  const gestures = (detector.props.gesture as { toGestureArray(): Array<{ config: { hitSlop: { width?: number } } }> }).toGestureArray();
  for (const g of gestures) {
    expect(g.config.hitSlop.width).toBe(EDGE_WIDTH);
  }
});
