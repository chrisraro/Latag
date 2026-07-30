import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("../lib/toast", () => ({ showError: jest.fn(), showSuccess: jest.fn() }));

import { showError } from "../lib/toast";
import { PrimaryButton } from "../components/ui";
import { DateTimeSheet } from "../components/DateTimeSheet";

const noop = () => {};

function render(props: Partial<Parameters<typeof DateTimeSheet>[0]> = {}): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<DateTimeSheet visible onConfirm={noop} onClose={noop} {...props} />);
  });
  return tree;
}

function pressConfirm(tree: ReactTestRenderer): void {
  const btn = tree.root.findAllByType(PrimaryButton).find((n) => n.props.label === "Set schedule")!;
  act(() => { (btn.props.onPress as () => void)(); });
}

function collectTexts(node: any, out: string[] = []): string[] {
  for (const child of node.children ?? []) {
    if (typeof child === "string") out.push(child);
    else collectTexts(child, out);
  }
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 6, 16, 12, 0, 0)); // Thu Jul 16 2026, noon
});
afterEach(() => {
  jest.useRealTimers();
});

test("default (today 9:00 AM) is already past noon -> guarded, no confirm", () => {
  const onConfirm = jest.fn();
  const tree = render({ onConfirm });
  pressConfirm(tree);
  expect(showError).toHaveBeenCalledWith("Pick a time in the future");
  expect(onConfirm).not.toHaveBeenCalled();
});

test("a time later today confirms and closes without an error toast", () => {
  const onConfirm = jest.fn();
  // 2pm today — after the noon system clock.
  const initial = new Date(2026, 6, 16, 14, 0, 0);
  const tree = render({ onConfirm, initial });
  pressConfirm(tree);
  expect(showError).not.toHaveBeenCalled();
  expect(onConfirm).toHaveBeenCalledTimes(1);
  const picked = (onConfirm.mock.calls[0] as [Date])[0];
  expect(picked.getHours()).toBe(14);
  expect(picked.getMinutes()).toBe(0);
});

test("a time exactly at now is guarded (<=, not <)", () => {
  const onConfirm = jest.fn();
  const initial = new Date(2026, 6, 16, 12, 0, 0); // exactly system time
  const tree = render({ onConfirm, initial });
  pressConfirm(tree);
  expect(showError).toHaveBeenCalledWith("Pick a time in the future");
  expect(onConfirm).not.toHaveBeenCalled();
});

// DESIGN.md/PRODUCT.md: touch targets >= 48x48px.
//
// A previous version of this test asserted `top + CONTENT_HEIGHT + bottom >=
// 48` against the `hitSlop` prop literal — but that arithmetic is copied
// straight from the same numbers used to build the prop, so it could never
// fail: it was checking the prop equals itself, not that the target is real.
// It also missed a real bug — RN's `hitSlop` is clipped to every ancestor's
// own bounds, and this pair's parent had exactly zero spare room (58px for a
// 58px-tall pair), so the slop was entirely invisible on a device.
//
// The actual fix drops hitSlop and gives each pill real h-12/w-14 (48x48px)
// dimensions instead. Jest's renderer never runs a Yoga layout pass, so this
// suite cannot measure rendered pixels — what it CAN check, honestly, is the
// structural property that makes the geometry safe: no hitSlop is being
// relied on to fake the size, and the box the pill actually claims (via its
// own className, not a slop prop) is a real NativeWind `h-12` (48px, see
// SecondaryButton/PrimaryButton in components/ui.tsx for the same convention
// establishing h-12 == 48px and h-14 == 56px in this codebase) and `w-14`
// (56px) — both >= the 48px minimum on their own, unaided by any slop.
test("AM and PM are real >=48x48px pills — no hitSlop standing in for the target size", () => {
  const tree = render();
  // NativeWind wraps `Pressable` per file, so identity-based `findAllByType`
  // doesn't match across module boundaries — match by component name instead,
  // and require the outer composite (not the inner Views it renders through)
  // so each chip is counted exactly once.
  const chips = tree.root.findAll(
    (n) =>
      typeof n.type === "function" &&
      n.type.name === "Pressable" &&
      ["AM", "PM"].includes(collectTexts(n).join("")),
  );
  expect(chips).toHaveLength(2);
  for (const chip of chips) {
    // No hitSlop anywhere in the chain — the size claim is the box itself.
    expect(chip.props.hitSlop).toBeUndefined();
    const className: string = chip.props.className;
    expect(className).toMatch(/(?:^|\s)h-12(?:\s|$)/); // 48px tall
    expect(className).toMatch(/(?:^|\s)w-14(?:\s|$)/); // 56px wide
  }
});
