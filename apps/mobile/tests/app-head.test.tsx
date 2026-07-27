import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { Text } from "react-native";
import { AppHead } from "../components/AppHead";

function render(el: React.JSX.Element): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => { tree = renderer.create(el); });
  return tree!;
}

/** Flattens every text node in render order. */
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

function gears(t: ReactTestRenderer) {
  return t.root.findAll((n) => typeof n.props?.onPress === "function" && n.props?.accessibilityLabel === "Settings");
}

test("a head without onSettings carries no gear", () => {
  const t = render(<AppHead title="Inventory" />);
  expect(gears(t)).toHaveLength(0);
});

test("onSettings renders one labelled gear button that calls back", () => {
  const onSettings = jest.fn();
  const t = render(<AppHead title="Inventory" onSettings={onSettings} />);
  const hits = gears(t);
  expect(hits).toHaveLength(1);
  expect(hits[0].props.accessibilityRole).toBe("button");
  act(() => { hits[0].props.onPress(); });
  expect(onSettings).toHaveBeenCalledTimes(1);
});

// The count badge is the thing most likely to be silently swallowed by a new
// right-slot occupant, so pin both being present at once.
test("the gear sits beside existing right content rather than replacing it", () => {
  const t = render(<AppHead title="Inventory" right={<Text>12</Text>} onSettings={() => {}} />);
  expect(gears(t)).toHaveLength(1);
  expect(texts(t)).toContain("12");
});

test("back button, title, right content and gear coexist", () => {
  const onBack = jest.fn();
  const t = render(<AppHead title="Inventory" onBack={onBack} right={<Text>12</Text>} onSettings={() => {}} />);
  const back = t.root.findAll((n) => typeof n.props?.onPress === "function" && n.props?.accessibilityLabel === "Back");
  expect(back).toHaveLength(1);
  expect(gears(t)).toHaveLength(1);
  expect(texts(t)).toContain("Inventory");
});
