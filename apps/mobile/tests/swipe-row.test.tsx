import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { Text } from "react-native";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
}));

import { SwipeRow, resolveSwipeable, type SwipeBinding } from "../components/SwipeRow";

let tree: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = null;
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

// ---------------------------------------------------------------------------
// Capability check
//
// `react-native-gesture-handler/ReanimatedSwipeable` pulls in Reanimated, which
// touches the worklets native module at *import* time — a static import would
// take the whole bundle down wherever that module is missing (Jest is exactly
// such a place). The resolution rule is therefore tested directly rather than
// by fighting Jest's module-load order.
// ---------------------------------------------------------------------------

test("a loader that throws degrades to no swipeable rather than propagating", () => {
  expect(resolveSwipeable(() => { throw new Error("native module missing"); })).toBeNull();
});

test("a module with nothing usable in it resolves to null", () => {
  expect(resolveSwipeable(() => undefined)).toBeNull();
  expect(resolveSwipeable(() => ({}))).toBeNull();
  expect(resolveSwipeable(() => ({ default: undefined }))).toBeNull();
});

test("the default export wins, and a bare export is accepted", () => {
  const Cmp = () => null;
  expect(resolveSwipeable(() => ({ default: Cmp }))).toBe(Cmp);
  expect(resolveSwipeable(() => Cmp)).toBe(Cmp);
});

// forwardRef/memo components are objects, not functions — rejecting those would
// reject the real `ReanimatedSwipeable`, which is exactly what we need.
test("a forwardRef-style object component is accepted", () => {
  const Cmp = { $$typeof: Symbol.for("react.forward_ref"), render: () => null };
  expect(resolveSwipeable(() => ({ default: Cmp }))).toBe(Cmp);
});

// ---------------------------------------------------------------------------
// The row itself
// ---------------------------------------------------------------------------

const markSold: SwipeBinding = {
  key: "markSold", label: "Mark sold", icon: "Check", side: "left", tone: "primary", guard: "undo",
  onPress: jest.fn(),
};

test("the row renders its content whether or not the gesture layer is there", () => {
  act(() => { tree = renderer.create(<SwipeRow actions={[markSold]}><Text>Carhartt</Text></SwipeRow>); });
  expect(texts(tree!)).toContain("Carhartt");
});

test("a row with no actions is still a row", () => {
  act(() => { tree = renderer.create(<SwipeRow actions={[]}><Text>Carhartt</Text></SwipeRow>); });
  expect(texts(tree!)).toContain("Carhartt");
});
