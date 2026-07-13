import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FONT } from "../lib/theme";
import { formatPeso } from "../lib/format";

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      hitSlop={4}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      className={`h-11 flex-none flex-row items-center rounded-full border px-4 ${selected ? "border-acid bg-acid" : "border-hairline bg-surface2"}`}
    >
      <Text style={{ fontFamily: selected ? FONT.bold : FONT.medium }} className={`text-[13px] ${selected ? "text-acidink" : "text-inkdim"}`}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = "default" }: { label: string; tone?: "default" | "sold" }) {
  return (
    <View className="flex-none rounded-full border border-hairline px-2.5 py-1">
      <Text style={{ fontFamily: FONT.display }} className={`text-[10px] tracking-wider ${tone === "sold" ? "text-inkfaint" : "text-inkdim"}`}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      className={`my-3 h-14 items-center justify-center rounded-full ${disabled ? "bg-surface2" : "bg-acid"} active:scale-[0.97]`}
    >
      <Text style={{ fontFamily: FONT.display, letterSpacing: 0.5 }} className={`text-[16px] uppercase ${disabled ? "text-inkfaint" : "text-acidink"}`}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} className={`h-12 flex-1 items-center justify-center rounded-full border ${danger ? "border-danger" : "border-hairline bg-surface2"}`}>
      <Text style={{ fontFamily: FONT.display, letterSpacing: 0.5 }} className={`text-[14px] uppercase ${danger ? "text-danger" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: string }) {
  return <Text style={{ fontFamily: FONT.semibold, letterSpacing: 1 }} className="mb-2 mt-4 text-[11.5px] uppercase text-inkfaint">{children}</Text>;
}

export function Money({ value, size = "row" }: { value: number; size?: "hero" | "row" }) {
  return (
    <Text
      style={{ fontFamily: size === "hero" ? FONT.displayBlack : FONT.bold, fontVariant: ["tabular-nums"] }}
      className={size === "hero" ? "text-[34px] text-acid" : "text-[17px] text-ink"}
    >
      {formatPeso(value)}
    </Text>
  );
}
