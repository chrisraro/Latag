import { Pressable, Text, View } from "react-native";
import { Icon } from "./Icon";
import { FONT, COLORS } from "../lib/theme";

/** Mockup .apphead: 40px circular back on surface2, 21px expanded-800 title, 12px gap, 12/8 vertical padding. */
export function AppHead({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 pb-2 pt-3">
      {onBack ? (
        <Pressable hitSlop={6} onPress={onBack} className="h-10 w-10 flex-none items-center justify-center rounded-full bg-surface2">
          <Icon name="CaretLeft" size={18} color={COLORS.inkDim} />
        </Pressable>
      ) : null}
      <Text numberOfLines={1} style={{ fontFamily: FONT.display }} className="min-w-0 flex-1 text-[21px] text-ink">{title}</Text>
      {right}
    </View>
  );
}
