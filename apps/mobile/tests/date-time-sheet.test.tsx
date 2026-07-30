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

// DESIGN.md/PRODUCT.md: touch targets >= 48x48px. The AM/PM chips are 26px
// tall (`h-[26px]`) and stacked 6px apart (`gap-1.5`) — a hitSlop is the only
// way to reach 48px without growing the pills past the 56px Wheel beside them
// and overlapping the other, so each chip must claim no more than half that
// 6px gap toward its neighbour.
test("AM and PM each reach the 48px touch-target minimum via hitSlop, without their zones overlapping", () => {
  const tree = render();
  const CONTENT_HEIGHT = 26;
  const GAP = 6;
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
    const { top = 0, bottom = 0 } = chip.props.hitSlop ?? {};
    expect(top + CONTENT_HEIGHT + bottom).toBeGreaterThanOrEqual(48);
    expect(Math.min(top, bottom)).toBeLessThanOrEqual(GAP / 2);
  }
});
