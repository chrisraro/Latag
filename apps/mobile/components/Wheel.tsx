import { useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FONT } from "../lib/theme";

const ITEM_W = 64;

export function Wheel({ values, value, onChange, unit, format }: {
  values: number[]; value: number; onChange: (v: number) => void; unit?: string; format?: (v: number) => string;
}) {
  const lastIndex = useRef(Math.max(0, values.indexOf(value)));
  const fmt = format ?? ((v: number) => String(v));
  return (
    <View className="h-14 justify-center overflow-hidden rounded-[14px] border border-hairline bg-surface2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM_W}
        decelerationRate="fast"
        contentOffset={{ x: lastIndex.current * ITEM_W, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: (390 - 32 - ITEM_W) / 2 }}
        onScroll={(e) => {
          const i = Math.min(values.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / ITEM_W)));
          if (i !== lastIndex.current) { lastIndex.current = i; Haptics.selectionAsync(); onChange(values[i]); }
        }}
        scrollEventThrottle={16}
      >
        {values.map((v) => (
          <View key={v} style={{ width: ITEM_W }} className="items-center justify-center">
            <Text
              style={{ fontFamily: v === value ? FONT.bold : FONT.semibold, fontVariant: ["tabular-nums"] }}
              className={v === value ? "text-[26px] text-ink" : "text-[15px] text-inkfaint"}
            >{fmt(v)}</Text>
            {v === value && <View className="mt-0.5 h-[3px] w-8 rounded-full bg-acid" />}
          </View>
        ))}
      </ScrollView>
      {unit ? <Text style={{ fontFamily: FONT.semibold }} className="absolute right-3.5 text-[12px] text-inkfaint">{unit}</Text> : null}
    </View>
  );
}

/** Helper to build wheel ranges. rangeValues(14, 36, 0.5) → [14, 14.5, …, 36] */
export function rangeValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 2) / 2);
  return out;
}
