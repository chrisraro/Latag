import { Pressable, Text, View } from "react-native";
import { Icon } from "./Icon";
import { FONT, COLORS } from "../lib/theme";

/**
 * Mockup .apphead: 40px circular back on surface2, expanded-800 title (21px default;
 * screens with a denser header — e.g. Rapid Console — pass size={17} per mockup h3
 * overrides), 12px gap, 12/10 vertical padding (bottom bumped from the mockup's 8
 * in the spacing polish pass so the head always clears the first content block).
 *
 * `onSettings` is how Settings is reached since G1 took it off the tab bar: a gear
 * in the right slot of every tab's header. It renders *after* `right`, never
 * instead of it — a screen's count badge and its gear both belong there.
 */
export function AppHead({ title, onBack, right, onSettings, size = 21 }: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  onSettings?: () => void;
  size?: number;
}) {
  return (
    <View className="flex-row items-center gap-3 pb-2.5 pt-3">
      {onBack ? (
        <Pressable hitSlop={6} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" className="h-10 w-10 flex-none items-center justify-center rounded-full bg-surface2">
          <Icon name="CaretLeft" size={18} color={COLORS.inkDim} />
        </Pressable>
      ) : null}
      <Text numberOfLines={1} style={{ fontFamily: FONT.display, fontSize: size }} className="min-w-0 flex-1 text-ink">{title}</Text>
      {right}
      {onSettings ? (
        <Pressable hitSlop={6} onPress={onSettings} accessibilityRole="button" accessibilityLabel="Settings" className="h-10 w-10 flex-none items-center justify-center rounded-full bg-surface2">
          <Icon name="GearSix" size={16} color={COLORS.inkDim} />
        </Pressable>
      ) : null}
    </View>
  );
}
