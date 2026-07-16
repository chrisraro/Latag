import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { sessions, type Session } from "../../db/schema";
import { updateSession, deleteSession } from "../../lib/repo";
import { REMINDER_PRESETS, formatScheduleStamp, parseOffsets } from "../../lib/schedule";
import { ensureNotifPermission, scheduleSessionReminders, cancelReminders, parseNotifIds } from "../../lib/notifications";
import { deleteFiles } from "../../lib/media";
import { FONT, COLORS } from "../../lib/theme";
import { showSuccess, showError } from "../../lib/toast";
import { Chip, FieldLabel, PrimaryButton, SecondaryButton } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { LocationPicker, type PickedLocation } from "../../components/LocationPicker";
import { DateTimeSheet } from "../../components/DateTimeSheet";

const DEFAULT_OFFSETS = [30]; // "30 min before"

/** Edit sheet for any session — name, location pin, and schedule. A schedule
 *  change cancels the previously scheduled reminders and reschedules. */
export default function EditSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Seed once — this sheet owns the draft; live updates underneath would fight the form.
  const session = useMemo(
    () => (id ? (db.select().from(sessions).where(eq(sessions.id, id)).all()[0] as Session | undefined) : undefined),
    [id],
  );

  const [name, setName] = useState(session?.name ?? "");
  const [pin, setPin] = useState<PickedLocation | null>(
    session?.locationName != null && session.lat != null && session.lng != null
      ? { name: session.locationName, lat: session.lat, lng: session.lng }
      : null,
  );
  const [scheduledAt, setScheduledAt] = useState<Date | null>(session?.scheduledAt ?? null);
  const [offsets, setOffsets] = useState<number[]>(() => {
    const stored = parseOffsets(session?.reminderOffsets ?? null);
    return stored.length > 0 ? stored : DEFAULT_OFFSETS;
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false); // double-tap guard

  if (!session) return null;

  const toggleOffset = (minutes: number) =>
    setOffsets((prev) => (prev.includes(minutes) ? prev.filter((m) => m !== minutes) : [...prev, minutes].sort((a, b) => a - b)));

  const save = async () => {
    if (saving || !name.trim()) return;
    setSaving(true);
    const oldTime = session.scheduledAt?.getTime() ?? null;
    const oldOffsets = parseOffsets(session.reminderOffsets);
    const newTime = scheduledAt?.getTime() ?? null;
    const newOffsets = scheduledAt ? offsets : [];
    const nameChanged = name.trim() !== session.name;
    const scheduleChanged = oldTime !== newTime || JSON.stringify(oldOffsets) !== JSON.stringify(newOffsets) || nameChanged;

    updateSession(db, session.id, {
      name: name.trim(),
      locationName: pin?.name ?? null,
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
      scheduledAt,
      reminderOffsets: scheduledAt ? offsets : null,
    });

    if (scheduleChanged) {
      // Cancel-then-reschedule: stale reminders must never fire for a moved session.
      await cancelReminders(parseNotifIds(session.reminderNotificationIds));
      let ids: string[] = [];
      if (scheduledAt && offsets.length > 0) {
        const granted = await ensureNotifPermission();
        if (!granted) showError("Reminders off — enable notifications in system settings");
        else {
          try {
            ids = await scheduleSessionReminders({ id: session.id, name: name.trim(), scheduledAt, offsets });
          } catch {
            // Best-effort: the schedule is saved even if reminders fail.
          }
        }
      }
      updateSession(db, session.id, { reminderNotificationIds: ids.length > 0 ? ids : null });
    }

    router.back();
    showSuccess(scheduledAt ? `Scheduled for ${formatScheduleStamp(scheduledAt)}` : "Session updated");
  };

  const confirmDelete = () =>
    Alert.alert("Delete session?", "All items and photos in this session are removed from your phone too.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const { photoUris, reminderNotificationIds } = deleteSession(db, session.id);
          cancelReminders(reminderNotificationIds).catch(() => {});
          deleteFiles(photoUris).catch(() => {});
          showSuccess("Session deleted");
          router.back();
        },
      },
    ]);

  const inputCls = "mb-3 h-[52px] rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink";
  return (
    <View className="flex-1 bg-surface1 px-5" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}>
      <View className="mb-3.5 h-1 w-11 self-center rounded-full bg-[#3A3A3A]" />
      <Text style={{ fontFamily: FONT.display }} className="mb-4 text-[19px] text-ink">Edit Session</Text>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="flex-1">
        <TextInput value={name} onChangeText={setName} placeholder="Session name" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }} className={inputCls} />
        <LocationPicker value={pin} onChange={setPin} />
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
      <PrimaryButton label="Save Changes" onPress={save} disabled={!name.trim() || saving} />
      <View className="mb-1 flex-row">
        <SecondaryButton label="Delete Session" icon="Trash" danger onPress={confirmDelete} />
      </View>
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
