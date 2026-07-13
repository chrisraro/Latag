import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FONT } from "../lib/theme";
import { PrimaryButton } from "./ui";

const MIN_ITEM_W = 64;
const CHAR_W = 15; // ~width of a 26px bold tabular digit incl. separators
const ITEM_PAD = 16;

function widthFor(labels: string[]): number {
  const longest = labels.reduce((a, l) => Math.max(a, l.length), 0);
  return Math.max(MIN_ITEM_W, longest * CHAR_W + ITEM_PAD);
}

export function Wheel({ values, value, onChange, unit, format, allowCustom }: {
  values: number[]; value: number; onChange: (v: number) => void; unit?: string;
  format?: (v: number) => string; allowCustom?: boolean;
}) {
  const fmt = format ?? ((v: number) => String(v));
  // Out-of-grid values (custom amounts, prefilled edits) still render and snap.
  const vals = useMemo(
    () => (values.includes(value) ? values : [...values, value].sort((a, b) => a - b)),
    [values, value],
  );
  // Item width fits the longest label so 5+ digit prices never overlap.
  const itemW = useMemo(() => widthFor(vals.map(fmt)), [vals, fmt]);
  const lastIndex = useRef(Math.max(0, vals.indexOf(value)));
  const scrollRef = useRef<ScrollView>(null);
  const [trackW, setTrackW] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commitCustom = () => {
    const n = Math.round(Number(draft.replace(/[^0-9]/g, "")));
    setEditing(false);
    if (!Number.isFinite(n) || n <= 0) return;
    Haptics.selectionAsync();
    onChange(n);
    // Snap the track to the (possibly newly injected) value using next-render metrics.
    const nextVals = values.includes(n) ? values : [...values, n].sort((a, b) => a - b);
    const nextItemW = widthFor(nextVals.map(fmt));
    const idx = nextVals.indexOf(n);
    lastIndex.current = idx;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: idx * nextItemW, animated: false }));
  };

  return (
    <View onLayout={(e) => setTrackW(e.nativeEvent.layout.width)} className="h-14 justify-center overflow-hidden rounded-[14px] border border-hairline bg-surface2">
      {trackW > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={itemW}
          decelerationRate="fast"
          contentOffset={{ x: lastIndex.current * itemW, y: 0 }}
          contentContainerStyle={{ paddingHorizontal: (trackW - itemW) / 2 }}
          onScroll={(e) => {
            const i = Math.min(vals.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / itemW)));
            if (i !== lastIndex.current) { lastIndex.current = i; Haptics.selectionAsync(); onChange(vals[i]); }
          }}
          scrollEventThrottle={16}
        >
          {vals.map((v) => (
            <View key={v} style={{ width: itemW }} className="items-center justify-center">
              <Text
                numberOfLines={1}
                style={{ fontFamily: v === value ? FONT.bold : FONT.semibold, fontVariant: ["tabular-nums"] }}
                className={v === value ? "text-[26px] text-ink" : "text-[15px] text-inkfaint"}
              >{fmt(v)}</Text>
              {v === value && <View className="mt-0.5 h-[3px] w-8 rounded-full bg-acid" />}
            </View>
          ))}
        </ScrollView>
      )}
      {unit ? (
        allowCustom ? (
          <Pressable
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Enter a custom amount`}
            onPress={() => { setDraft(String(value)); setEditing(true); }}
            className="absolute right-3.5"
          >
            <Text style={{ fontFamily: FONT.semibold, textDecorationLine: "underline" }} className="text-[12px] text-acid">{unit}</Text>
          </Pressable>
        ) : (
          <Text style={{ fontFamily: FONT.semibold }} className="absolute right-3.5 text-[12px] text-inkfaint">{unit}</Text>
        )
      ) : null}
      {allowCustom ? (
        <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" className="flex-1 bg-black/60" onPress={() => setEditing(false)} />
          <View className="rounded-t-sheet border-t border-hairline bg-surface1 px-4 pb-8 pt-3">
            <View className="mb-3 h-1 w-11 self-center rounded-full bg-hairline" />
            <Text style={{ fontFamily: FONT.display }} className="text-[17px] text-ink">Custom amount</Text>
            <View className="mt-3 flex-row items-center gap-3">
              {unit ? <Text style={{ fontFamily: FONT.bold }} className="text-[22px] text-inkdim">{unit}</Text> : null}
              <TextInput
                value={draft}
                onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commitCustom}
                accessibilityLabel="Custom amount"
                style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }}
                className="h-14 flex-1 rounded-[14px] border border-acid bg-surface2 px-4 text-[20px] text-ink"
              />
            </View>
            <PrimaryButton label="Set amount" onPress={commitCustom} disabled={!draft.trim()} />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/** Helper to build wheel ranges. rangeValues(14, 36, 0.5) → [14, 14.5, …, 36] */
export function rangeValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 2) / 2);
  return out;
}
