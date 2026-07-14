import { View, Text, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, items } from "../db/schema";
import { FONT } from "../lib/theme";
import { formatPeso, formatPct } from "../lib/format";
import { selectorProjected, selectorRealized, bultoRealizedPct } from "../lib/math";
import { Badge, PrimaryButton } from "../components/ui";

export default function SessionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).orderBy(desc(sessions.createdAt)));
  const { data: itemRows } = useLiveQuery(db.select().from(items));

  const list = (sessionRows ?? []).map((s) => {
    const its = (itemRows ?? []).filter((i) => i.sessionId === s.id);
    const soldCount = its.filter((i) => i.status === "sold").length;
    const allSold = its.length > 0 && soldCount === its.length;
    let headline: string, note: string, negative = false;
    if (s.type === "bulto") {
      const pct = bultoRealizedPct(its, s.totalBaleCost ?? 0);
      headline = pct == null ? "—" : formatPct(pct); note = "recovered";
    } else if (allSold) {
      const realized = selectorRealized(its);
      headline = formatPeso(realized); note = "realized"; negative = realized < 0;
    } else {
      const projected = selectorProjected(its);
      headline = formatPeso(projected); note = "projected"; negative = projected < 0;
    }
    return { s, count: its.length, soldCount, headline, note, negative };
  });

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Text style={{ fontFamily: FONT.displayBlack }} className="flex-1 text-[26px] text-ink">LATAG</Text>
        <Badge label={`${list.length} SESSIONS`} />
        <Pressable hitSlop={8} onPress={() => router.push("/settings")} className="h-11 w-11 items-center justify-center rounded-full bg-surface2">
          <Text className="text-[18px] text-inkdim">⚙</Text>
        </Pressable>
      </View>
      {list.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-4 px-4">
          <View className="h-24 w-full items-center justify-center rounded-card border border-dashed border-hairline">
            <Text style={{ fontFamily: FONT.text }} className="text-[13px] text-inkfaint">Your first run will show up here</Text>
          </View>
          <Text style={{ fontFamily: FONT.display }} className="text-[18px] text-ink">No sessions yet</Text>
          <Text style={{ fontFamily: FONT.text }} className="text-center text-[13.5px] leading-5 text-inkdim">
            Start one when you hit the racks.{"\n"}Everything works in airplane mode.
          </Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={({ s }) => s.id}
          renderItem={({ item: { s, count, soldCount, headline, note, negative } }) => (
            <Pressable onPress={() => router.push(`/session/${s.id}`)} className="mb-3 rounded-card border border-hairline bg-surface1 p-4">
              <View className="flex-row items-center gap-2">
                <Text style={{ fontFamily: FONT.semibold }} className="flex-1 text-[17px] text-ink" numberOfLines={1}>{s.name}</Text>
                <Badge label={s.type.toUpperCase()} />
              </View>
              {s.location ? <Text style={{ fontFamily: FONT.text }} className="mt-0.5 text-[12px] text-inkfaint">{s.location}</Text> : null}
              <View className="mt-4 flex-row items-baseline justify-between">
                <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="text-[12px] text-inkfaint">{count} items · {soldCount} sold</Text>
                <Text style={{ fontFamily: FONT.display, fontVariant: ["tabular-nums"] }} className={`text-[22px] ${negative ? "text-danger" : "text-acid"}`}>
                  {headline} <Text className="text-[12px] text-inkfaint">{note}</Text>
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label="＋  New Session" onPress={() => router.push("/session/new")} />
      </View>
    </View>
  );
}
