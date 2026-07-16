import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, isNull, isNotNull } from "drizzle-orm";
import * as Haptics from "expo-haptics";
import { db } from "../db/client";
import { sessions, items, type Session } from "../db/schema";
import { FONT, COLORS } from "../lib/theme";
import { formatPct } from "../lib/format";
import { selectorProjected, selectorRealized, bultoRealizedPct } from "../lib/math";
import { decideStartRoute } from "../lib/first-run";
import { formatCountdown, formatScheduleStamp, scheduleSortKey, parseOffsets } from "../lib/schedule";
import { startScheduledSession } from "../lib/repo";
import { cancelReminders } from "../lib/notifications";
import { showSuccess } from "../lib/toast";
import { Badge, Chip, Money, PrimaryButton } from "../components/ui";
import { Icon } from "../components/Icon";

type Tab = "sessions" | "scheduled";

function reminderSummary(offsets: number[]): string {
  if (offsets.length === 0) return "No reminders";
  return offsets.length === 1 ? "1 reminder" : `${offsets.length} reminders`;
}

/** MapPin + name line shared by live and scheduled cards. */
function PinLine({ name }: { name: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon name="MapPin" size={11} color={COLORS.inkFaint} />
      <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="flex-shrink text-[12px] text-inkfaint" numberOfLines={1}>{name}</Text>
    </View>
  );
}

export default function SessionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("sessions");
  // Countdown clock: re-render every 30s while anything is scheduled so
  // "in 45m" cards stay honest without any data change.
  const [now, setNow] = useState(() => new Date());
  const startGuard = useRef(false); // double-tap guard for Start now
  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).where(isNull(sessions.scheduledAt)).orderBy(desc(sessions.createdAt)));
  const { data: scheduledRows } = useLiveQuery(db.select().from(sessions).where(isNotNull(sessions.scheduledAt)));
  const { data: itemRows } = useLiveQuery(db.select().from(items));

  // First-run gate: redirect once if welcome/onboarding is still pending,
  // otherwise render normally. Rendering null until this resolves avoids
  // flashing the sessions list before the redirect lands (splash is already
  // up at mount).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.multiGet(["latag.welcomed", "latag.onboarded"]).then((pairs) => {
      if (cancelled) return;
      const flags = Object.fromEntries(pairs);
      const route = decideStartRoute(flags["latag.welcomed"] !== null, flags["latag.onboarded"] !== null);
      if (route) {
        router.replace(route);
      } else {
        setChecked(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const hasScheduled = (scheduledRows?.length ?? 0) > 0;
  useEffect(() => {
    if (!hasScheduled) return;
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [hasScheduled]);

  // Start-now double-tap guard releases once the live query reflects the
  // conversion (the card is gone by then) — no timer to leak.
  useEffect(() => {
    startGuard.current = false;
  }, [scheduledRows]);

  if (!checked) return null;

  const list = (sessionRows ?? []).map((s) => {
    const its = (itemRows ?? []).filter((i) => i.sessionId === s.id);
    const soldCount = its.filter((i) => i.status === "sold").length;
    const allSold = its.length > 0 && soldCount === its.length;
    // Bulto headlines a recovery percentage (not currency); Selector headlines
    // a peso amount that can go negative (a loss), so `money` stays null for
    // Bulto and `pct` stays null for Selector — the render picks one path.
    let pct: number | null = null, money: number | null = null, note: string, negative = false;
    if (s.type === "bulto") {
      pct = bultoRealizedPct(its, s.totalBaleCost ?? 0);
      note = "recovered";
    } else if (allSold) {
      money = selectorRealized(its); note = "realized"; negative = money < 0;
    } else {
      money = selectorProjected(its); note = "projected"; negative = money < 0;
    }
    return { s, count: its.length, soldCount, pct, money, note, negative };
  });
  const scheduled = [...(scheduledRows ?? [])].sort((a, b) => scheduleSortKey(a) - scheduleSortKey(b));

  const switchTab = (t: Tab) => {
    if (t === tab) return;
    Haptics.selectionAsync();
    if (t === "scheduled") setNow(new Date()); // fresh countdowns on entry
    setTab(t);
  };

  const startNow = (s: Session) => {
    if (startGuard.current) return;
    startGuard.current = true;
    const { notificationIds } = startScheduledSession(db, s.id);
    cancelReminders(notificationIds).catch(() => {}); // best-effort; ids may have fired already
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSuccess("Session started");
    router.push(`/session/${s.id}`);
  };

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2.5 pt-3">
        <Text style={{ fontFamily: FONT.displayBlack }} className="flex-1 text-[26px] uppercase text-acid">Latag</Text>
        {list.length > 0 ? <Badge label={`${list.length} SESSIONS`} /> : null}
        <Pressable hitSlop={8} onPress={() => router.push("/settings")} accessibilityRole="button" accessibilityLabel="Settings" className="h-10 w-10 items-center justify-center rounded-full bg-surface2">
          <Icon name="GearSix" size={18} color={COLORS.inkDim} />
        </Pressable>
      </View>
      <View className="mb-3 mt-1 flex-row gap-1 rounded-full border border-hairline bg-surface2 p-1">
        <Pressable
          hitSlop={4}
          onPress={() => switchTab("sessions")}
          accessibilityRole="button"
          accessibilityLabel="Sessions"
          accessibilityState={{ selected: tab === "sessions" }}
          className={`h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-3.5 ${tab === "sessions" ? "bg-acid" : ""}`}
        >
          <Text style={{ fontFamily: FONT.display, letterSpacing: 0.39 }} className={`text-[13px] uppercase ${tab === "sessions" ? "text-acidink" : "text-inkdim"}`}>Sessions</Text>
        </Pressable>
        <Pressable
          hitSlop={4}
          onPress={() => switchTab("scheduled")}
          accessibilityRole="button"
          accessibilityLabel="Scheduled"
          accessibilityState={{ selected: tab === "scheduled" }}
          className={`h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-3.5 ${tab === "scheduled" ? "bg-acid" : ""}`}
        >
          <Text style={{ fontFamily: FONT.display, letterSpacing: 0.39 }} className={`text-[13px] uppercase ${tab === "scheduled" ? "text-acidink" : "text-inkdim"}`}>Scheduled</Text>
          {scheduled.length > 0 ? (
            <View className={`min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 ${tab === "scheduled" ? "bg-acidink" : "bg-acid"}`}>
              <Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"], lineHeight: 13 }} className={`text-[11px] ${tab === "scheduled" ? "text-acid" : "text-acidink"}`}>{scheduled.length}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {tab === "sessions" ? (
        list.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-3.5 px-4">
            <View className="h-[92px] w-full items-center justify-center rounded-card border-[1.5px] border-dashed border-hairline">
              <Text style={{ fontFamily: FONT.text, lineHeight: 18 }} className="text-[13px] text-inkfaint">Your first run will show up here</Text>
            </View>
            <View className="items-center">
              <Text style={{ fontFamily: FONT.display }} className="text-[18px] text-ink">No sessions yet</Text>
              <Text style={{ fontFamily: FONT.text }} className="mt-1.5 text-center text-[13.5px] leading-5 text-inkdim">
                Start one when you hit the racks.{"\n"}Everything works in airplane mode.
              </Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={({ s }) => s.id}
            renderItem={({ item: { s, count, soldCount, pct, money, note, negative } }) => (
              <Pressable onPress={() => router.push(`/session/${s.id}`)} className="mb-3 rounded-card border border-hairline bg-surface1 p-[18px]">
                <View className="flex-row items-center gap-3">
                  <Text style={{ fontFamily: FONT.semibold }} className="flex-1 text-[17px] text-ink" numberOfLines={1}>{s.name}</Text>
                  <Badge label={s.type.toUpperCase()} />
                </View>
                {s.locationName ? (
                  <View className="mt-1"><PinLine name={s.locationName} /></View>
                ) : s.location ? (
                  <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="mt-1 text-[12px] text-inkfaint">{s.location}</Text>
                ) : null}
                <View className="mt-4 flex-row items-baseline justify-between gap-3">
                  <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 17 }} className="text-[12px] text-inkfaint">{count} items · {soldCount} sold</Text>
                  {s.type === "bulto" ? (
                    <Text style={{ fontFamily: FONT.display, fontVariant: ["tabular-nums"] }} className={`text-[22px] ${negative ? "text-danger" : "text-acid"}`}>
                      {pct === null ? "—" : formatPct(pct)} <Text style={{ fontFamily: FONT.medium }} className="text-[12px] text-inkfaint">{note}</Text>
                    </Text>
                  ) : (
                    <Text style={{ fontVariant: ["tabular-nums"] }}>
                      <Money value={money ?? 0} size="card" negative={negative} />
                      <Text style={{ fontFamily: FONT.medium }} className="text-[12px] text-inkfaint"> {note}</Text>
                    </Text>
                  )}
                </View>
              </Pressable>
            )}
          />
        )
      ) : scheduled.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <View className="min-h-[92px] w-full items-center justify-center rounded-card border-[1.5px] border-dashed border-hairline px-6 py-5">
            <Text style={{ fontFamily: FONT.text, lineHeight: 18 }} className="text-center text-[13px] text-inkfaint">No scheduled sessions — plan your next bale run from New Session</Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={scheduled}
          keyExtractor={(s) => s.id}
          renderItem={({ item: s }) => {
            // scheduledAt is non-null by query (IS NOT NULL); overdue keeps the
            // card here (no dashboard nav) but flags it acid until Start now.
            const at = s.scheduledAt!;
            const overdue = at.getTime() <= now.getTime();
            return (
              <View className={`mb-3 rounded-card border bg-surface1 p-[18px] ${overdue ? "border-acid" : "border-hairline"}`}>
                <View className="flex-row items-center gap-3">
                  <Text style={{ fontFamily: FONT.semibold }} className="flex-1 text-[17px] text-ink" numberOfLines={1}>{s.name}</Text>
                  <Text style={{ fontFamily: FONT.display, fontVariant: ["tabular-nums"] }} className="text-[15px] text-acid">{formatCountdown(at, now)}</Text>
                </View>
                <View className="mt-1 flex-row items-center gap-1">
                  <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="text-[12px] text-inkfaint">{formatScheduleStamp(at)}</Text>
                  {s.locationName ? (<>
                    <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="text-[12px] text-inkfaint"> · </Text>
                    <PinLine name={s.locationName} />
                  </>) : null}
                </View>
                <View className="mt-4 flex-row items-center justify-between gap-3">
                  <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 17 }} className="text-[12px] text-inkfaint">{reminderSummary(parseOffsets(s.reminderOffsets))}</Text>
                  <View className="flex-row gap-2">
                    <Chip label="Edit" onPress={() => router.push(`/session/edit?id=${s.id}`)} />
                    <Chip label="Start now" selected onPress={() => startNow(s)} />
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label="New Session" icon="Plus" onPress={() => router.push("/session/new")} />
      </View>
    </View>
  );
}
