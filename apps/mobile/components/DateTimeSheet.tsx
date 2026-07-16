import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FONT } from "../lib/theme";
import { formatScheduleStamp } from "../lib/schedule";
import { showError } from "../lib/toast";
import { FieldLabel, PrimaryButton } from "./ui";
import { Wheel, rangeValues } from "./Wheel";

const DAY_SPAN = 30; // today .. +30d
const HOUR_VALUES = rangeValues(1, 12, 1);
const MINUTE_VALUES = rangeValues(0, 55, 5);

/** Midnight of `d` shifted by `days` — day math immune to DST/hour arithmetic. */
function dayStart(d: Date, days = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** "Sat · Jul 18" — the date part of formatScheduleStamp. */
function dayLabel(offset: number): string {
  return formatScheduleStamp(dayStart(new Date(), offset)).split(" · ").slice(0, 2).join(" · ");
}

/** Bottom sheet composing three Wheels (day / hour / minute) + an AM/PM chip
 *  pair into a schedule Date — no native date-picker dependency. */
export function DateTimeSheet({
  visible,
  initial,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  initial?: Date | null;
  onConfirm: (d: Date) => void;
  onClose: () => void;
}) {
  const seed = initial ?? null;
  const [dayOffset, setDayOffset] = useState(() => {
    if (!seed) return 0;
    const diff = Math.round((dayStart(seed).getTime() - dayStart(new Date()).getTime()) / 86_400_000);
    return Math.max(0, Math.min(DAY_SPAN, diff));
  });
  const [hour, setHour] = useState(() => (seed ? (seed.getHours() % 12 === 0 ? 12 : seed.getHours() % 12) : 9));
  const [minute, setMinute] = useState(() => (seed ? Math.min(55, Math.round(seed.getMinutes() / 5) * 5) : 0));
  const [period, setPeriod] = useState<"AM" | "PM">(() => (seed && seed.getHours() >= 12 ? "PM" : "AM"));

  const confirm = () => {
    const h24 = period === "AM" ? hour % 12 : (hour % 12) + 12;
    const d = dayStart(new Date(), dayOffset);
    d.setHours(h24, minute, 0, 0);
    if (d <= new Date()) {
      showError("Pick a time in the future");
      return;
    }
    onConfirm(d);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" className="flex-1 bg-black/60" onPress={onClose} />
      <View className="rounded-t-sheet border-t border-hairline bg-surface1 px-5 pb-8 pt-3">
        <View className="mb-3.5 h-1 w-11 self-center rounded-full bg-hairline" />
        <Text style={{ fontFamily: FONT.display }} className="text-[17px] text-ink">Schedule session</Text>
        <FieldLabel>Day</FieldLabel>
        <Wheel values={rangeValues(0, DAY_SPAN, 1)} value={dayOffset} onChange={setDayOffset} format={dayLabel} />
        <FieldLabel>Time</FieldLabel>
        <View className="flex-row items-center gap-2">
          <View className="flex-[1.1]">
            <Wheel values={HOUR_VALUES} value={hour} onChange={setHour} />
          </View>
          <Text style={{ fontFamily: FONT.bold }} className="text-[18px] text-inkfaint">:</Text>
          <View className="flex-[1.1]">
            <Wheel values={MINUTE_VALUES} value={minute} onChange={setMinute} format={(v) => String(v).padStart(2, "0")} />
          </View>
          <View className="gap-1.5">
            {(["AM", "PM"] as const).map((p) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityState={{ selected: period === p }}
                onPress={() => { Haptics.selectionAsync(); setPeriod(p); }}
                className={`h-[26px] w-14 items-center justify-center rounded-full border ${period === p ? "border-acid bg-acid" : "border-hairline bg-surface2"}`}
              >
                <Text style={{ fontFamily: period === p ? FONT.bold : FONT.medium }} className={`text-[12px] ${period === p ? "text-acidink" : "text-inkdim"}`}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <PrimaryButton label="Set schedule" onPress={confirm} />
      </View>
    </Modal>
  );
}
