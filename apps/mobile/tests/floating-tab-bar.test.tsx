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

import * as Haptics from "expo-haptics";
import { FloatingTabBar } from "../components/FloatingTabBar";

beforeEach(() => { jest.clearAllMocks(); });

const NAMES = ["index", "batches", "shop", "settings"] as const;
const TITLES: Record<string, string> = {
  index: "Inventory", batches: "Batches", shop: "Shop", settings: "Settings",
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

test("renders one accessible button per route, labelled by its title", () => {
  const { props } = makeProps();
  const t = render(props);
  expect(tabs(t).map((n) => n.props.accessibilityLabel)).toEqual([
    "Inventory", "Batches", "Shop", "Settings",
  ]);
  expect(tabs(t).every((n) => n.props.accessibilityRole === "button")).toBe(true);
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

test("pressing the already-focused tab does not navigate or buzz", () => {
  const { props, navigate } = makeProps({ index: 0 });
  const t = render(props);
  act(() => { tabByLabel(t, "Inventory").props.onPress(); });
  expect(navigate).not.toHaveBeenCalled();
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
});

test("long press emits tabLongPress for that route", () => {
  const { props, emit } = makeProps();
  const t = render(props);
  act(() => { tabByLabel(t, "Batches").props.onLongPress(); });
  expect(emit).toHaveBeenCalledWith({ type: "tabLongPress", target: "batches-key" });
});
