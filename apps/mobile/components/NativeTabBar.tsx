import { Component, type ReactNode } from "react";
import { Platform, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { COLORS } from "../lib/theme";
import { NATIVE_UI_ENABLED } from "../lib/native-ui";
import { scrollTabToTop } from "../lib/tab-scroll";
import { Icon, type IconName } from "./Icon";
import { FloatingTabBar, TAB_DESTINATIONS, TAB_BAR_CLEARANCE } from "./FloatingTabBar";

export { TAB_BAR_CLEARANCE };

/** Route name → icon. Mirrors `FloatingTabBar`'s map (kept local — this file
 *  has no compile-time need for the fallback's internals beyond its two
 *  exported constants). */
const TAB_ICONS: Record<string, IconName> = {
  index: "House",
  inventory: "Package",
  batches: "Stack",
  shop: "Storefront",
};

export type JetpackUI = typeof import("@expo/ui/jetpack-compose");

/**
 * Decides whether the native toolbar can be used, given a platform name and
 * a loader for the module. Pure and side-effect free on purpose: it is
 * exercised directly in tests (with a fake platform / a loader that throws)
 * instead of fighting Jest's module-load order to simulate an unlinked
 * native module.
 *
 * `HorizontalFloatingToolbar` ships only for Jetpack Compose — verified
 * against the installed @expo/ui package's build/swift-ui directory, which
 * has no floating-toolbar equivalent (only `TabView`). iOS therefore always
 * returns `null` here and keeps `FloatingTabBar`.
 *
 * On Android, `@expo/ui/jetpack-compose`'s `HorizontalFloatingToolbar` calls
 * `requireNativeView('ExpoUI', 'HorizontalFloatingToolbarView')` at *import*
 * time — if that native view manager isn't linked, the `require()` throws
 * before any component even renders, so a static top-level `import` would
 * take the whole tab bar (and therefore all navigation) down with it. The
 * loader is called inside a `try`/`catch` for exactly that reason.
 */
export function resolveJetpackUI(platform: string, loadModule: () => JetpackUI): JetpackUI | null {
  if (platform !== "android") return null;
  try {
    const mod = loadModule();
    return typeof mod?.HorizontalFloatingToolbar === "function" && typeof mod?.Host === "function" ? mod : null;
  } catch {
    return null;
  }
}

// Computed once, at module load — Platform.OS never changes for a running
// process, so there is no reason to re-resolve this on every render.
//
// Gated on NATIVE_UI_ENABLED, which is currently false: this exact toolbar
// crash-looped the owner's phone on 2026-07-27. The crash was inside Compose,
// on the UI thread, where `NativeTabBarBoundary` below cannot see it — read
// lib/native-ui.ts before changing this line. With the gate off the app uses
// `FloatingTabBar`, which is what shipped and what carries the brand anyway.
const jetpackUI = NATIVE_UI_ENABLED
  ? resolveJetpackUI(Platform.OS, () => require("@expo/ui/jetpack-compose"))
  : null;

/** Anything that goes wrong *after* the module resolves — a bad prop, a
 *  native-side layout edge case — still must not white-screen the app. */
class NativeTabBarBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export interface NativeTabBarProps extends BottomTabBarProps {
  onQuickAdd: () => void;
}

/** Public entry point — wires the module-level capability singleton into
 *  `NativeTabBarView`. `app/(tabs)/_layout.tsx` renders this. */
export function NativeTabBar(props: NativeTabBarProps) {
  return <NativeTabBarView {...props} jetpackUI={jetpackUI} />;
}

/**
 * Renders the real toolbar when `jetpackUI` resolved; otherwise (or on any
 * render-time error from the native tree) the existing `FloatingTabBar`.
 * Losing navigation is never an acceptable failure, so this is the seam
 * tests exercise directly with `jetpackUI: null` / a stub module — it is the
 * fallback-is-mandatory guarantee, decoupled from Jest's module-load order.
 */
export function NativeTabBarView({
  jetpackUI: ui,
  onQuickAdd,
  ...tabBarProps
}: NativeTabBarProps & { jetpackUI: JetpackUI | null }) {
  if (!ui) return <FloatingTabBar {...tabBarProps} />;
  return (
    <NativeTabBarBoundary fallback={<FloatingTabBar {...tabBarProps} />}>
      <NativeToolbar {...tabBarProps} onQuickAdd={onQuickAdd} ui={ui} />
    </NativeTabBarBoundary>
  );
}

function NativeToolbar({
  state,
  descriptors,
  navigation,
  onQuickAdd,
  ui,
}: BottomTabBarProps & { onQuickAdd: () => void; ui: JetpackUI }) {
  const insets = useSafeAreaInsets();
  const { Host, HorizontalFloatingToolbar, IconButton, RNHostView } = ui;

  const hostStyle: ViewStyle = {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: insets.bottom + 12,
    height: 64,
  };

  const buttons = TAB_DESTINATIONS.map((name) => {
    const index = state.routes.findIndex((r) => r.name === name);
    if (index < 0) return null; // destination not mounted in this navigator
    const route = state.routes[index];
    const focused = state.index === index;
    const label = descriptors[route.key]?.options.title ?? route.name;
    // toolbarContentColor (below) sets the inactive tint; RNHostView content
    // doesn't inherit Compose's LocalContentColor, so the active tint is
    // applied directly to the hosted icon instead of via a toolbar colour
    // prop — there is no per-item colour override on the toolbar itself.
    const tint = focused ? COLORS.acid : COLORS.inkFaint;

    const onPress = () => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (event.defaultPrevented) return;
      if (focused) {
        if (scrollTabToTop(route.name)) Haptics.selectionAsync();
        return;
      }
      Haptics.selectionAsync();
      navigation.navigate(route.name, route.params);
    };

    return (
      <IconButton key={route.key} onClick={onPress}>
        <RNHostView>
          <View accessible accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }}>
            <Icon name={TAB_ICONS[route.name] ?? "Package"} size={22} color={tint} />
          </View>
        </RNHostView>
      </IconButton>
    );
  });

  return (
    <Host style={hostStyle}>
      <HorizontalFloatingToolbar
        colors={{
          toolbarContainerColor: COLORS.surface1,
          toolbarContentColor: COLORS.inkFaint,
          fabContainerColor: COLORS.acid,
          fabContentColor: COLORS.acidInk,
        }}
      >
        {buttons}
        <HorizontalFloatingToolbar.FloatingActionButton onPress={onQuickAdd}>
          <RNHostView>
            <View accessible accessibilityRole="button" accessibilityLabel="Quick add">
              <Icon name="Plus" size={22} color={COLORS.acidInk} />
            </View>
          </RNHostView>
        </HorizontalFloatingToolbar.FloatingActionButton>
      </HorizontalFloatingToolbar>
    </Host>
  );
}
