import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
// The native glass view is unavailable under jest; the bar must fall back to a
// plain surface exactly as it does on Android.
jest.mock("expo-glass-effect", () => {
  const { View } = require("react-native");
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { FloatingTabBar, TAB_DESTINATIONS } from "../components/FloatingTabBar";
import { registerTabScroll } from "../lib/tab-scroll";

beforeEach(() => { jest.clearAllMocks(); });

/** Runs `fn` as if the bundle were running on `os`. */
function onPlatform(os: "ios" | "android", fn: () => void) {
  const original = Platform.OS;
  (Platform as { OS: string }).OS = os;
  try { fn(); } finally { (Platform as { OS: string }).OS = original; }
}

// The navigator mounts more routes than the bar shows: `settings` still lives in
// `(tabs)` (deep-linkable, and reachable from every screen's header gear since
// G1 Task 4) but is no longer a destination.
const NAMES = ["index", "inventory", "batches", "shop", "settings"] as const;
const TITLES: Record<string, string> = {
  index: "Home", inventory: "Inventory", batches: "Batches", shop: "Shop", settings: "Settings",
};

function makeProps({ index = 0, prevent = false } = {}) {
  const routes = NAMES.map((name) => ({ key: `${name}-key`, name, params: undefined }));
  const emit = jest.fn(() => ({ defaultPrevented: prevent }));
  const navigate = jest.fn();
  const descriptors = Object.fromEntries(
    routes.map((r) => [r.key, { options: { title: TITLES[r.name] } }]),
  );
  const props = {
    state: { index, routes },
    descriptors,
    navigation: { emit, navigate },
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
  };
  // The bar only reads the slice of BottomTabBarProps modelled above.
  return { props: props as unknown as Parameters<typeof FloatingTabBar>[0], emit, navigate };
}

function render(props: Parameters<typeof FloatingTabBar>[0]): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => { tree = renderer.create(<FloatingTabBar {...props} />); });
  return tree!;
}

function tabs(t: ReactTestRenderer) {
  return t.root.findAll((n) => typeof n.props?.onPress === "function" && !!n.props?.accessibilityLabel);
}

function tabByLabel(t: ReactTestRenderer, label: string) {
  const hit = tabs(t).find((n) => n.props.accessibilityLabel === label);
  expect(hit).toBeTruthy();
  return hit!;
}

test("renders one accessible control per destination, labelled by its title", () => {
  const { props } = makeProps();
  const t = render(props);
  expect(tabs(t).map((n) => n.props.accessibilityLabel)).toEqual([
    "Home", "Inventory", "Batches", "Shop",
  ]);
});

test("four destinations — Settings is a route, not a tab", () => {
  expect(TAB_DESTINATIONS).toEqual(["index", "inventory", "batches", "shop"]);
  const t = render(makeProps().props);
  expect(tabs(t)).toHaveLength(4);
  expect(tabs(t).map((n) => n.props.accessibilityLabel)).not.toContain("Settings");
});

// React Navigation ships Platform.select({ ios: "button", default: "tab" }) —
// TalkBack needs role=tab to announce "tab 3 of 4", VoiceOver reads the bar.
test("Android announces each control as a tab", () => {
  onPlatform("android", () => {
    const t = render(makeProps().props);
    expect(tabs(t).every((n) => n.props.accessibilityRole === "tab")).toBe(true);
  });
});

test("iOS keeps the button role", () => {
  onPlatform("ios", () => {
    const t = render(makeProps().props);
    expect(tabs(t).every((n) => n.props.accessibilityRole === "button")).toBe(true);
  });
});

test("only the focused route is marked selected", () => {
  const { props } = makeProps({ index: 1 });
  const t = render(props);
  expect(tabs(t).map((n) => n.props.accessibilityState.selected)).toEqual([false, true, false, false]);
});

test("pressing an unfocused tab emits tabPress and navigates", () => {
  const { props, emit, navigate } = makeProps({ index: 0 });
  const t = render(props);
  act(() => { tabByLabel(t, "Shop").props.onPress(); });
  expect(emit).toHaveBeenCalledWith({ type: "tabPress", target: "shop-key", canPreventDefault: true });
  expect(navigate).toHaveBeenCalledWith("shop", undefined);
  expect(Haptics.selectionAsync).toHaveBeenCalled();
});

test("a prevented tabPress does not navigate or buzz", () => {
  const { props, emit, navigate } = makeProps({ index: 0, prevent: true });
  const t = render(props);
  act(() => { tabByLabel(t, "Shop").props.onPress(); });
  expect(emit).toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
});

test("re-tapping the active tab scrolls its list to the top instead of navigating", () => {
  const scroll = jest.fn();
  const unregister = registerTabScroll("index", scroll);
  const { props, navigate } = makeProps({ index: 0 });
  const t = render(props);
  act(() => { tabByLabel(t, "Home").props.onPress(); });
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
  expect(Haptics.selectionAsync).toHaveBeenCalled(); // the tap did something — say so
  unregister();
});

test("re-tapping an active tab with nothing to scroll stays silent", () => {
  const { props, navigate } = makeProps({ index: 0 });
  const t = render(props);
  act(() => { tabByLabel(t, "Home").props.onPress(); });
  expect(navigate).not.toHaveBeenCalled();
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
});

test("long press emits tabLongPress for that route", () => {
  const { props, emit } = makeProps();
  const t = render(props);
  act(() => { tabByLabel(t, "Batches").props.onLongPress(); });
  expect(emit).toHaveBeenCalledWith({ type: "tabLongPress", target: "batches-key" });
});

// The fallback bar carries quick-add too (G2 Task 2): when the native toolbar
// is unavailable this is the only bar, and it must still be able to add an item.
test("no quick-add handler means no FAB — the bar is still just four tabs", () => {
  const t = render(makeProps().props);
  expect(tabs(t).map((n) => n.props.accessibilityLabel)).not.toContain("Quick add");
});

test("a quick-add handler renders the FAB, which fires it once", () => {
  const onQuickAdd = jest.fn();
  const { props } = makeProps();
  const t = render({ ...props, onQuickAdd });
  const fab = tabByLabel(t, "Quick add");
  expect(fab.props.accessibilityRole).toBe("button");
  act(() => { fab.props.onPress(); });
  expect(onQuickAdd).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalled();
});
