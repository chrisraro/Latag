import { Animated, Platform, Pressable, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { FONT, COLORS } from "../lib/theme";
import { usePressScale } from "../lib/motion";
import { scrollTabToTop } from "../lib/tab-scroll";
import { Icon, type IconName } from "./Icon";

/**
 * The bar's destinations, in order. This is an allowlist, not a mirror of the
 * navigator: `(tabs)` also holds `home.tsx` (which `index` re-exports) and
 * `settings.tsx`, and a route file must never become a destination just by
 * existing. Anything not listed here is reachable by route but not by the bar —
 * Settings is now opened by the gear in every screen's `AppHead`, and by its
 * `/settings` deep link.
 */
export const TAB_DESTINATIONS = ["index", "inventory", "batches", "shop"] as const;

/** Route name → icon. Keep in sync with `app/(tabs)/_layout.tsx`. */
const TAB_ICONS: Record<string, IconName> = {
  index: "House",
  inventory: "Package",
  batches: "Stack",
  shop: "Storefront",
};

/** Bar geometry — screens pad their own content by `BAR_CLEARANCE` + insets.bottom. */
export const TAB_BAR_HEIGHT = 60;
export const TAB_BAR_GAP = 12;
/** Bottom padding a tab screen needs (on top of insets.bottom) to clear the bar. */
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + TAB_BAR_GAP + 8;
/** Quick-add FAB, mirroring the native toolbar's trailing FAB. */
const FAB_SIZE = 56;

/**
 * Floating pill tab bar. iOS with Liquid Glass gets the real material; every
 * other surface (Android, older iOS, tests) falls back to an opaque surface1
 * pill so the bar is never a transparent smudge over the list behind it.
 *
 * `onQuickAdd` renders the trailing FAB. It is optional so the bar can still be
 * mounted bare, but the app always passes it: when the native toolbar is
 * unavailable this bar *is* the whole bar, and losing quick-add with it would
 * leave the fallback with no way to log an item.
 */
export function FloatingTabBar({ state, descriptors, navigation, onQuickAdd }: BottomTabBarProps & { onQuickAdd?: () => void }) {
  const insets = useSafeAreaInsets();
  const glass = Platform.OS === "ios" && isLiquidGlassAvailable();
  // The first half of the FAB → composer transition: the button gives under the
  // thumb, then the composer rises from the bottom (its `animation` is set in
  // app/_layout.tsx). Purely decorative — `onPress` navigates immediately and
  // never waits for the scale to settle.
  const press = usePressScale();

  const container: ViewStyle = {
    position: "absolute",
    left: 20,
    // The pill yields the FAB's width plus a gap when quick-add is present.
    right: onQuickAdd ? 20 + FAB_SIZE + 12 : 20,
    bottom: insets.bottom + TAB_BAR_GAP,
    height: TAB_BAR_HEIGHT,
    flexDirection: "row",
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.hairline,
  };

  const fab = onQuickAdd ? (
    <Animated.View
      style={{
        position: "absolute",
        right: 20,
        bottom: insets.bottom + TAB_BAR_GAP + (TAB_BAR_HEIGHT - FAB_SIZE) / 2,
        ...press.style,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick add"
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onQuickAdd(); }}
        style={{
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.acid,
        }}
      >
        <Icon name="Plus" size={22} color={COLORS.acidInk} />
      </Pressable>
    </Animated.View>
  ) : null;

  const buttons = TAB_DESTINATIONS.map((name) => {
    const index = state.routes.findIndex((r) => r.name === name);
    if (index < 0) return null; // destination not mounted in this navigator
    const route = state.routes[index];
    const focused = state.index === index;
    const label = descriptors[route.key]?.options.title ?? route.name;
    const tint = focused ? COLORS.acid : COLORS.inkFaint;

    const onPress = () => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (event.defaultPrevented) return;
      if (focused) {
        // Standard behaviour: re-tapping the active tab returns its list to the
        // top. Buzz only if a list was actually there to scroll.
        if (scrollTabToTop(route.name)) Haptics.selectionAsync();
        return;
      }
      Haptics.selectionAsync();
      navigation.navigate(route.name, route.params);
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        onLongPress={() => { navigation.emit({ type: "tabLongPress", target: route.key }); }}
        // Matches React Navigation's Platform.select({ ios: "button", default:
        // "tab" }): TalkBack needs role=tab to announce "tab 3 of 4", while
        // VoiceOver reads the bar itself and prefers plain buttons.
        accessibilityRole={Platform.OS === "ios" ? "button" : "tab"}
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name={TAB_ICONS[route.name] ?? "Package"} size={22} color={tint} />
        <Text
          numberOfLines={1}
          style={{
            fontFamily: FONT.display, fontSize: 10, letterSpacing: 0.4,
            textTransform: "uppercase", marginTop: 3, color: tint,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  });

  return (
    <>
      {glass
        ? <GlassView style={container} glassEffectStyle="regular">{buttons}</GlassView>
        : <View style={[container, { backgroundColor: COLORS.surface1 }]}>{buttons}</View>}
      {fab}
    </>
  );
}
