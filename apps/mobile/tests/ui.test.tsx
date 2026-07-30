import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

import { Badge, SecondaryButton } from "../components/ui";

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

/**
 * `Badge`'s "sold" tone used to render via `border-inkfaint`/`text-inkfaint`
 * even though @latag/tokens now names this exact color (#8A8A8A) `sold`. The
 * values were always identical, so this is a semantic-only change — the
 * assertions below pin the new class names so a future revert back to the
 * ink-faint classes (which would still render identically but would no
 * longer express the actual meaning) shows up as a failing test.
 *
 * NativeWind wraps each styled host element in an extra node that carries
 * the same `className`, so `findAll` returns duplicates per element rather
 * than one node per View/Text — dedupe into a set of distinct classNames
 * instead of indexing by position.
 */
function distinctClassNames(t: ReactTestRenderer): string[] {
  const found = t.root.findAll((n) => typeof n.props?.className === "string");
  return Array.from(new Set(found.map((n) => n.props.className as string)));
}

test("Badge's sold tone uses the sold token, not ink-faint, even though they render identically", () => {
  const t = render(<Badge label="Sold" tone="sold" />);
  const classNames = distinctClassNames(t);
  const view = classNames.find((c) => c.includes("rounded-full border"));
  const text = classNames.find((c) => c.includes("text-[10.5px]"));
  expect(view).toContain("border-sold");
  expect(view).not.toContain("inkfaint");
  expect(text).toContain("text-sold");
  expect(text).not.toContain("inkfaint");
});

test("Badge's default tone is unaffected by the sold-token switch", () => {
  const t = render(<Badge label="Available" />);
  const classNames = distinctClassNames(t);
  const view = classNames.find((c) => c.includes("rounded-full border"));
  const text = classNames.find((c) => c.includes("text-[10.5px]"));
  expect(view).toContain("border-hairline");
  expect(text).toContain("text-inkdim");
});
