import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

import { SecondaryButton } from "../components/ui";

let tree: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = null;
});

function render(el: React.ReactElement): ReactTestRenderer {
  act(() => { tree = renderer.create(el); });
  return tree!;
}

/** The innermost node carrying onPress — the rendered Pressable, not the
 *  SecondaryButton element itself (which also has an onPress prop). */
function button(t: ReactTestRenderer) {
  const hits = t.root.findAll((n) => typeof n.props?.onPress === "function");
  expect(hits.length).toBeGreaterThan(0);
  return hits[hits.length - 1];
}

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

test("a plain secondary button is pressable and announces itself as a button", () => {
  const onPress = jest.fn();
  const t = render(<SecondaryButton label="Save photos" onPress={onPress} />);
  act(() => { button(t).props.onPress(); });
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(button(t).props.accessibilityRole).toBe("button");
  expect(button(t).props.accessibilityState).toEqual({ disabled: false, busy: false });
});

test("busy blocks the press, says so to screen readers, and shows in the label", () => {
  const onPress = jest.fn();
  const t = render(<SecondaryButton label="Save photos" busy onPress={onPress} />);
  expect(button(t).props.disabled).toBe(true);
  expect(button(t).props.accessibilityState).toEqual({ disabled: true, busy: true });
  expect(texts(t)).toContain("Save photos…");
});

test("disabled blocks the press without claiming to be working", () => {
  const t = render(<SecondaryButton label="Retry" disabled onPress={jest.fn()} />);
  expect(button(t).props.disabled).toBe(true);
  expect(button(t).props.accessibilityState).toEqual({ disabled: true, busy: false });
  expect(texts(t)).toContain("Retry");
});
