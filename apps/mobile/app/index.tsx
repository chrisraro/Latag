import { useEffect, useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, items } from "../db/schema";
import { FONT, COLORS } from "../lib/theme";
import { formatPct } from "../lib/format";
import { selectorProjected, selectorRealized, bultoRealizedPct } from "../lib/math";
import { decideStartRoute } from "../lib/first-run";
import { Badge, Money, PrimaryButton } from "../components/ui";
import { Icon } from "../components/Icon";

export default function SessionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);
  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).orderBy(desc(sessions.createdAt)));
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

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2.5 pt-3">
        <Text style={{ fontFamily: FONT.displayBlack }} className="flex-1 text-[26px] uppercase text-acid">Latag</Text>
        {list.length > 0 ? <Badge label={`${list.length} SESSIONS`} /> : null}
        <Pressable hitSlop={8} onPress={() => router.push("/settings")} accessibilityRole="button" accessibilityLabel="Settings" className="h-10 w-10 items-center justify-center rounded-full bg-surface2">
          <Icon name="GearSix" size={18} color={COLORS.inkDim} />
        </Pressable>
      </View>
      {list.length === 0 ? (
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
              {s.location ? <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="mt-1 text-[12px] text-inkfaint">{s.location}</Text> : null}
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
      )}
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label="New Session" icon="Plus" onPress={() => router.push("/session/new")} />
      </View>
    </View>
  );
}
