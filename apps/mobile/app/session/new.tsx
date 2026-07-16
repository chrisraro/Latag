import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { db } from "../../db/client";
import { createSession, updateSession } from "../../lib/repo";
import { REMINDER_PRESETS, formatScheduleStamp, reminderTimes } from "../../lib/schedule";
import { ensureNotifPermission, scheduleSessionReminders } from "../../lib/notifications";
import { FONT, COLORS } from "../../lib/theme";
import { showSuccess, showError } from "../../lib/toast";
import { Chip, FieldLabel, PrimaryButton } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { Wheel, rangeValues } from "../../components/Wheel";
import { LocationPicker, type PickedLocation } from "../../components/LocationPicker";
import { DateTimeSheet } from "../../components/DateTimeSheet";

const BALE_VALUES = rangeValues(1000, 50000, 500);
const DEFAULT_OFFSETS = [30]; // "30 min before"

export default function NewSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [type, setType] = useState<"selector" | "bulto">("selector");
  const [baleCost, setBaleCost] = useState(10000);
  const [pin, setPin] = useState<PickedLocation | null>(null);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [offsets, setOffsets] = useState<number[]>(DEFAULT_OFFSETS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false); // double-tap guard

  const toggleOffset = (minutes: number) =>
    setOffsets((prev) => (prev.includes(minutes) ? prev.filter((m) => m !== minutes) : [...prev, minutes].sort((a, b) => a - b)));

  const create = async () => {
    if (creating || !name.trim()) return;
    setCreating(true);
    const base = {
      name: name.trim(), type,
      totalBaleCost: type === "bulto" ? baleCost : 0,
      locationName: pin?.name ?? null, lat: pin?.lat ?? null, lng: pin?.lng ?? null,
    };
    if (!scheduledAt) {
      const s = createSession(db, base);
      // Close the modal FIRST, then push — replace() from inside a modal corrupts
      // the back stack (dashboard's back button stopped returning to the list).
      router.dismiss();
      router.push(`/session/${s.id}`);
      showSuccess(`${s.name} created`);
      return;
    }
    // Scheduled path: session creation never blocks on notifications — a
    // permission deny or scheduling failure still saves the session.
    const granted = await ensureNotifPermission();
    if (!granted) showError("Reminders off — enable notifications in system settings");
    const s = createSession(db, { ...base, scheduledAt, reminderOffsets: offsets });
    if (granted && offsets.length > 0) {
      if (reminderTimes(scheduledAt, offsets, new Date()).length === 0) {
        showError("All reminders would be in the past — session scheduled without reminders");
      } else {
        try {
          const ids = await scheduleSessionReminders({ id: s.id, name: s.name, scheduledAt, offsets });
          if (ids.length > 0) updateSession(db, s.id, { reminderNotificationIds: ids });
        } catch {
          // Best-effort: reminders failed but the scheduled session is saved.
        }
      }
    }
    router.dismiss(); // back to the list — a scheduled session has no dashboard yet
    showSuccess(`Scheduled for ${formatScheduleStamp(scheduledAt)}`);
  };

  const inputCls = "mb-3 h-[52px] rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink";
  return (
    <View className="flex-1 bg-surface1 px-5" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}>
      <View className="mb-3.5 h-1 w-11 self-center rounded-full bg-[#3A3A3A]" />
      <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">New Session</Text>
      <Text style={{ fontFamily: FONT.text, lineHeight: 18 }} className="mb-4 mt-1 text-[12.5px] text-inkfaint">Name it after the spot — you'll thank yourself later.</Text>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="flex-1">
        <TextInput value={name} onChangeText={setName} placeholder="Session name" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }} className={inputCls} />
        <FieldLabel>Mode</FieldLabel>
        <View className="flex-row gap-1 rounded-full border border-hairline bg-surface2 p-1">
          {(["selector", "bulto"] as const).map((t) => (
            <Pressable key={t} onPress={() => { Haptics.selectionAsync(); setType(t); }} className={`h-11 flex-1 items-center justify-center rounded-full ${type === t ? "bg-acid" : ""}`}>
              <Text style={{ fontFamily: FONT.display, letterSpacing: 0.39 }} className={`text-[13px] uppercase ${type === t ? "text-acidink" : "text-inkdim"}`}>{t}</Text>
            </Pressable>
          ))}
        </View>
        {type === "bulto" ? (<>
          <FieldLabel>Bale cost</FieldLabel>
          <Wheel values={BALE_VALUES} value={baleCost} onChange={setBaleCost} unit="₱" format={(v) => v.toLocaleString("en-PH")} allowCustom />
        </>) : null}
        <View className="mt-5">
          <LocationPicker value={pin} onChange={setPin} />
        </View>
        <FieldLabel>Schedule for later · optional</FieldLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={scheduledAt ? `Scheduled for ${formatScheduleStamp(scheduledAt)}` : "Pick a date and time"}
          onPress={() => { Haptics.selectionAsync(); setSheetOpen(true); }}
          className="mb-3 h-[52px] flex-row items-center gap-2.5 rounded-[14px] border border-hairline bg-surface2 px-4"
        >
          <Text style={{ fontFamily: FONT.text }} numberOfLines={1} className={`flex-1 text-[15px] ${scheduledAt ? "text-ink" : "text-inkfaint"}`}>
            {scheduledAt ? formatScheduleStamp(scheduledAt) : "Pick a date & time"}
          </Text>
          {scheduledAt ? (
            <Pressable
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear schedule"
              onPress={() => { Haptics.selectionAsync(); setScheduledAt(null); setOffsets(DEFAULT_OFFSETS); }}
            >
              <Icon name="X" size={18} color={COLORS.inkFaint} />
            </Pressable>
          ) : (
            <Icon name="CaretDown" size={16} color={COLORS.inkFaint} />
          )}
        </Pressable>
        {scheduledAt ? (<>
          <FieldLabel>Remind me</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {REMINDER_PRESETS.map((p) => (
              <Chip key={p.minutes} label={p.label} selected={offsets.includes(p.minutes)} onPress={() => toggleOffset(p.minutes)} />
            ))}
          </View>
        </>) : null}
      </ScrollView>
      <PrimaryButton label={scheduledAt ? "Schedule Session" : "Create Session"} onPress={create} disabled={!name.trim() || creating} />
      {sheetOpen ? (
        <DateTimeSheet
          visible
          initial={scheduledAt}
          onConfirm={(d) => { setScheduledAt(d); setSheetOpen(false); }}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </View>
  );
}
