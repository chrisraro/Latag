import Toast from "react-native-toast-message";
import { showSuccess, showError } from "../lib/toast";

jest.mock("react-native-toast-message", () => ({
  __esModule: true,
  default: { show: jest.fn(), hide: jest.fn() },
}));

const mockToast = Toast as unknown as { show: jest.Mock; hide: jest.Mock };

/** The props the last `Toast.show` was called with. */
function lastShow(): { text1: string; onPress?: () => void; autoHide: boolean } {
  return mockToast.show.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  mockToast.show.mockClear();
  mockToast.hide.mockClear();
});

test("an undo toast runs its action once, however many times it is tapped", () => {
  // A swipe queues "Sold — tap to undo" for four seconds. Two taps inside that
  // window used to run the undo twice: two delete rows in the publish queue and
  // two "Removed from shop" toasts for one gesture. A double-tap is one
  // intention, not two.
  const undo = jest.fn();
  showSuccess("Sold at ₱250 — tap to undo", { onPress: undo });

  const { onPress } = lastShow();
  onPress?.();
  onPress?.();
  onPress?.();

  expect(undo).toHaveBeenCalledTimes(1);
});

test("tapping an undo toast dismisses it, so it cannot be tapped again", () => {
  showSuccess("Publishing — tap to undo", { onPress: jest.fn() });
  lastShow().onPress?.();
  expect(mockToast.hide).toHaveBeenCalled();
});

test("a sticky toast still runs its action once and dismisses", () => {
  const act = jest.fn();
  showError("Sync failed — tap to retry", { onPress: act, sticky: true });

  const shown = lastShow();
  expect(shown.autoHide).toBe(false);
  shown.onPress?.();
  shown.onPress?.();

  expect(act).toHaveBeenCalledTimes(1);
  expect(mockToast.hide).toHaveBeenCalledTimes(1);
});

test("a plain toast carries no press handler and auto-hides", () => {
  showSuccess("Saved");
  const shown = lastShow();
  expect(shown.onPress).toBeUndefined();
  expect(shown.autoHide).toBe(true);
});

test("each toast gets its own once-guard", () => {
  // The guard must not leak between toasts: sell one item, undo it, sell
  // another, and the second undo has to still work.
  const first = jest.fn();
  showSuccess("first — tap to undo", { onPress: first });
  lastShow().onPress?.();

  const second = jest.fn();
  showSuccess("second — tap to undo", { onPress: second });
  lastShow().onPress?.();

  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
});
