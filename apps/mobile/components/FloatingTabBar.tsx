import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { FONT, COLORS } from "../lib/theme";
import { scrollTabToTop } from "../lib/tab-scroll";
import { Icon, type IconName } from "./Icon";

/**
 * The bar's destinations, in order. This is an allowlist, not a mirror of the
 * navigator: `(tabs)` also holds `home.tsx`, which `index` re-exports, and a
 * route file must never become a destination just by existing. Anything not
 * listed here is reachable by route but not by the bar. (`settings` leaves in
 * G1 Task 4, when the gear moves into every screen's header.)
 */
export const TAB_DESTINATIONS = ["index", "inventory", "batches", "shop", "settings"] as const;

/** Route name → icon. Keep in sync with `app/(tabs)/_layout.tsx`. */
const TAB_ICONS: Record<string, IconName> = {
  index: "House",
  inventory: "Package",
  batches: "Stack",
  shop: "Storefront",
  settings: "GearSix",
};

/** Bar geometry — screens pad their own content by `BAR_CLEARANCE` + insets.bottom. */
export const TAB_BAR_HEIGHT = 60;
export const TAB_BAR_GAP = 12;
/** Bottom padding a tab screen needs (on top of insets.bottom) to clear the bar. */
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + TAB_BAR_GAP + 8;

/**
 * Floating pill tab bar. iOS with Liquid Glass gets the real material; every
 * other surface (Android, older iOS, tests) falls back to an opaque surface1
 * pill so the bar is never a transparent smudge over the list behind it.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const glass = Platform.OS === "ios" && isLiquidGlassAvailable();

  const container: ViewStyle = {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: insets.bottom + TAB_BAR_GAP,
    height: TAB_BAR_HEIGHT,
    flexDirection: "row",
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.hairline,
  };

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

  if (glass) {
    return <GlassView style={container} glassEffectStyle="regular">{buttons}</GlassView>;
  }
  return <View style={[container, { backgroundColor: COLORS.surface1 }]}>{buttons}</View>;
}
