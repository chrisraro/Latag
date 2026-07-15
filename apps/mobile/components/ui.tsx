import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FONT, COLORS } from "../lib/theme";
import { formatPesoParts } from "../lib/format";
import { Icon, type IconName } from "./Icon";

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
    <View className="flex-none rounded-full border border-hairline px-[9px] py-[3px]">
      <Text style={{ fontFamily: FONT.display, letterSpacing: 0.42 }} className={`text-[10.5px] ${tone === "sold" ? "text-inkfaint" : "text-inkdim"}`}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: IconName;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      className={`mb-3 mt-4 h-14 flex-row items-center justify-center gap-2 rounded-full ${disabled ? "bg-surface2" : "bg-acid"} active:scale-[0.97]`}
    >
      {icon ? <Icon name={icon} size={18} color={COLORS.acidInk} /> : null}
      <Text style={{ fontFamily: FONT.display, letterSpacing: 0.48 }} className={`text-[16px] uppercase ${disabled ? "text-inkfaint" : "text-acidink"}`}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} className={`h-12 flex-1 items-center justify-center rounded-full border ${danger ? "border-danger" : "border-hairline bg-surface2"}`}>
      <Text style={{ fontFamily: FONT.display, letterSpacing: 0.42 }} className={`text-[14px] uppercase ${danger ? "text-danger" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: string }) {
  return <Text style={{ fontFamily: FONT.semibold, letterSpacing: 0.92 }} className="mb-2 mt-4 text-[11.5px] uppercase text-inkfaint">{children}</Text>;
}

const MONEY_SPEC = {
  hero: { symbolFont: FONT.semibold, symbolSize: 22, amountFont: FONT.displayBlack, amountSize: 34, amountClass: "text-acid" },
  row: { symbolFont: FONT.semibold, symbolSize: 13, amountFont: FONT.bold, amountSize: 17, amountClass: "text-ink" },
  card: { symbolFont: FONT.semibold, symbolSize: 15, amountFont: FONT.display, amountSize: 22, amountClass: "text-acid" },
} as const;

export function Money({ value, size = "row", negative }: { value: number; size?: "hero" | "row" | "card"; negative?: boolean }) {
  const spec = MONEY_SPEC[size];
  const { symbol, amount } = formatPesoParts(value);
  // `negative` overrides the size's default tint with danger red (e.g. a
  // realized loss on a fully-sold Selector session) — row's default ink
  // tone is unaffected since it was never acid to begin with.
  const tone = negative ? "text-danger" : spec.amountClass;
  return (
    <Text style={{ fontVariant: ["tabular-nums"] }}>
      <Text style={{ fontFamily: spec.symbolFont, fontSize: spec.symbolSize }} className={tone}>{symbol}</Text>
      <Text style={{ fontFamily: spec.amountFont, fontSize: spec.amountSize }} className={tone}>{amount}</Text>
    </Text>
  );
}
