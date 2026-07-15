import { Pressable, Text, View } from "react-native";
import { Icon } from "./Icon";
import { FONT, COLORS } from "../lib/theme";

/**
 * Mockup .apphead: 40px circular back on surface2, expanded-800 title (21px default;
 * screens with a denser header — e.g. Rapid Console — pass size={17} per mockup h3
 * overrides), 12px gap, 12/10 vertical padding (bottom bumped from the mockup's 8
 * in the spacing polish pass so the head always clears the first content block).
 */
export function AppHead({ title, onBack, right, size = 21 }: { title: string; onBack?: () => void; right?: React.ReactNode; size?: number }) {
  return (
    <View className="flex-row items-center gap-3 pb-2.5 pt-3">
      {onBack ? (
        <Pressable hitSlop={6} onPress={onBack} className="h-10 w-10 flex-none items-center justify-center rounded-full bg-surface2">
          <Icon name="CaretLeft" size={18} color={COLORS.inkDim} />
        </Pressable>
      ) : null}
      <Text numberOfLines={1} style={{ fontFamily: FONT.display, fontSize: size }} className="min-w-0 flex-1 text-ink">{title}</Text>
      {right}
    </View>
  );
}
