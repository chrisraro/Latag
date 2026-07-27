import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { Pressable, View } from "react-native";

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
jest.mock("expo-glass-effect", () => {
  const { View } = require("react-native");
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});

import * as Haptics from "expo-haptics";
import { NativeTabBar, NativeTabBarView, resolveJetpackUI, type JetpackUI } from "../components/NativeTabBar";
import { registerTabScroll } from "../lib/tab-scroll";

beforeEach(() => {
  jest.clearAllMocks();
});

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
    onQuickAdd: jest.fn(),
  };
  return { props: props as unknown as Parameters<typeof NativeTabBar>[0], emit, navigate, onQuickAdd: props.onQuickAdd };
}

/** A working stand-in for `@expo/ui/jetpack-compose`, built from real RN
 *  primitives so react-test-renderer can inspect it exactly like it inspects
 *  `FloatingTabBar`'s `Pressable`s. */
function stubJetpackUI(): JetpackUI {
  const { View } = require("react-native");
  const HorizontalFloatingToolbar = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
  HorizontalFloatingToolbar.FloatingActionButton = ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
  }) => (
    <Pressable accessibilityLabel="Quick add (FAB)" onPress={onPress}>
      {children}
    </Pressable>
  );
  return {
    Host: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    HorizontalFloatingToolbar,
    IconButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
      <Pressable accessibilityLabel="IconButton" onPress={onClick}>
        {children}
      </Pressable>
    ),
    RNHostView: ({ children }: { children: React.ReactNode }) => children,
  } as unknown as JetpackUI;
}

function render(tree: React.ReactElement): ReactTestRenderer {
  let t: ReactTestRenderer;
  act(() => { t = renderer.create(tree); });
  return t!;
}

/** Finds the pressable instance (an `onPress`-carrying node — matched this
 *  way rather than by `.type === Pressable` because `react-test-renderer`
 *  can resolve the same host tree through more than one module instance of
 *  `react-native`, breaking reference equality) that, via a descendant,
 *  carries `label` as its accessibilityLabel — used for both the fallback
 *  bar's own Pressables and the native stub's Pressables. */
function pressableFor(t: ReactTestRenderer, label: string) {
  const hit = t.root.findAll(
    (n) => typeof n.props?.onPress === "function" && n.findAll((d) => d.props?.accessibilityLabel === label).length > 0,
  );
  expect(hit.length).toBeGreaterThan(0);
  return hit[0];
}

/** Matches only the composite `View` instance, not the host node underneath
 *  it that resolves to the same props — without this, every match would be
 *  double-counted (once at each level). */
function accessibleViews(t: ReactTestRenderer, extra: (props: Record<string, unknown>) => boolean = () => true) {
  return t.root.findAll((n) => n.type === View && !!n.props?.accessible && extra(n.props as Record<string, unknown>));
}

describe("resolveJetpackUI — the capability check", () => {
  test("never attempts the native module off Android (no SwiftUI HorizontalFloatingToolbar ships)", () => {
    const loader = jest.fn();
    expect(resolveJetpackUI("ios", loader)).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  test("falls back when the native module fails to load on Android", () => {
    const loader = jest.fn(() => {
      throw new Error("native view manager not linked");
    });
    expect(resolveJetpackUI("android", loader)).toBeNull();
  });

  test("falls back when the loaded module is missing required exports", () => {
    expect(resolveJetpackUI("android", () => ({}) as JetpackUI)).toBeNull();
  });

  test("resolves the module when it loads with the required exports on Android", () => {
    const ui = stubJetpackUI();
    expect(resolveJetpackUI("android", () => ui)).toBe(ui);
  });
});

describe("NativeTabBarView — fallback is mandatory", () => {
  test("renders FloatingTabBar's four destinations when the native module is unavailable", () => {
    const { props } = makeProps();
    const t = render(<NativeTabBarView {...props} jetpackUI={null} />);
    const tabs = t.root.findAll((n) => typeof n.props?.onPress === "function" && !!n.props?.accessibilityLabel);
    expect(tabs.map((n) => n.props.accessibilityLabel)).toEqual(["Home", "Inventory", "Batches", "Shop"]);
  });

  test("a native module that resolves but throws while rendering also falls back, via the error boundary", () => {
    // Distinct from the `jetpackUI: null` case above: here the capability
    // check *did* resolve something, but it blows up once actually used
    // (e.g. a linked-but-broken native view). The boundary must still land
    // on FloatingTabBar rather than white-screening the app.
    const poisoned = new Proxy(
      {},
      {
        get() {
          throw new Error("native module blew up on use");
        },
      },
    ) as unknown as JetpackUI;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { props } = makeProps();
    const t = render(<NativeTabBarView {...props} jetpackUI={poisoned} />);
    const tabs = t.root.findAll((n) => typeof n.props?.onPress === "function" && !!n.props?.accessibilityLabel);
    expect(tabs.map((n) => n.props.accessibilityLabel)).toEqual(["Home", "Inventory", "Batches", "Shop"]);
    errorSpy.mockRestore();
  });
});

describe("NativeTabBarView — native path", () => {
  const ui = stubJetpackUI();

  test("renders one control per destination plus the FAB, correctly labelled", () => {
    const { props } = makeProps();
    const t = render(<NativeTabBarView {...props} jetpackUI={ui} />);
    const labels = accessibleViews(t, (p) => p.accessibilityRole === "tab").map((n) => n.props.accessibilityLabel);
    expect(labels).toEqual(["Home", "Inventory", "Batches", "Shop"]);
    expect(accessibleViews(t, (p) => p.accessibilityLabel === "Quick add")).toHaveLength(1);
  });

  test("only the focused destination is marked selected", () => {
    const { props } = makeProps({ index: 2 });
    const t = render(<NativeTabBarView {...props} jetpackUI={ui} />);
    const states = accessibleViews(t, (p) => p.accessibilityRole === "tab").map(
      (n) => (n.props.accessibilityState as { selected?: boolean } | undefined)?.selected,
    );
    expect(states).toEqual([false, false, true, false]);
  });

  test("tapping the FAB fires onQuickAdd", () => {
    const { props, onQuickAdd } = makeProps();
    const t = render(<NativeTabBarView {...props} jetpackUI={ui} />);
    act(() => { pressableFor(t, "Quick add (FAB)").props.onPress(); });
    expect(onQuickAdd).toHaveBeenCalledTimes(1);
  });

  test("pressing an unfocused destination emits tabPress, navigates, and buzzes", () => {
    const { props, emit, navigate } = makeProps({ index: 0 });
    const t = render(<NativeTabBarView {...props} jetpackUI={ui} />);
    act(() => { pressableFor(t, "Shop").props.onPress(); });
    expect(emit).toHaveBeenCalledWith({ type: "tabPress", target: "shop-key", canPreventDefault: true });
    expect(navigate).toHaveBeenCalledWith("shop", undefined);
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  test("a prevented tabPress does not navigate or buzz", () => {
    const { props, navigate } = makeProps({ index: 0, prevent: true });
    const t = render(<NativeTabBarView {...props} jetpackUI={ui} />);
    act(() => { pressableFor(t, "Shop").props.onPress(); });
    expect(navigate).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  test("re-tapping the active destination scrolls its list to the top instead of navigating", () => {
    const scroll = jest.fn();
    const unregister = registerTabScroll("index", scroll);
    const { props, navigate } = makeProps({ index: 0 });
    const t = render(<NativeTabBarView {...props} jetpackUI={ui} />);
    act(() => { pressableFor(t, "Home").props.onPress(); });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    unregister();
  });
});
