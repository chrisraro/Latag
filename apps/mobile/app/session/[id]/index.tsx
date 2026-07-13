import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import { sessions, items, photos, type Item } from "../../../db/schema";
import { FONT } from "../../../lib/theme";
import { formatPeso, formatPct, formatInches } from "../../../lib/format";
import { selectorProjected, selectorRealized, bultoProjectedPct, bultoRealizedPct, soldRevenue } from "../../../lib/math";
import { Badge, Chip, PrimaryButton } from "../../../components/ui";

type Filter = "all" | "available" | "sold";

export default function DashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).where(eq(sessions.id, id)), [id]);
  const { data: itemRows } = useLiveQuery(db.select().from(items).where(eq(items.sessionId, id)).orderBy(desc(items.createdAt)), [id]);
  const { data: photoRows } = useLiveQuery(db.select().from(photos), []);
  const session = sessionRows?.[0];
  if (!session) return null;
  const all = itemRows ?? [];
  const visible = all.filter((i) => filter === "all" || i.status === filter);
  const thumbOf = (itemId: string) => (photoRows ?? []).find((p) => p.itemId === itemId && p.type === "front")?.localUri ?? null;

  const projPct = bultoProjectedPct(all, session.totalBaleCost ?? 0);
  const realPct = bultoRealizedPct(all, session.totalBaleCost ?? 0);

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2">
          <Text className="text-[18px] text-inkdim">‹</Text>
        </Pressable>
        <Text style={{ fontFamily: FONT.display }} className="flex-1 text-[20px] text-ink" numberOfLines={1}>{session.name}</Text>
        <Badge label={session.type.toUpperCase()} />
      </View>

      {session.type === "selector" ? (
        <View className="py-3">
          <Text style={{ fontFamily: FONT.semibold, letterSpacing: 1 }} className="text-[11.5px] uppercase text-inkfaint">Projected profit</Text>
          <Text style={{ fontFamily: FONT.displayBlack, fontVariant: ["tabular-nums"] }} className="text-[34px] text-acid">{formatPeso(selectorProjected(all))}</Text>
          <View className="mt-2 flex-row gap-5">
            <View><Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className={`text-[17px] ${selectorRealized(all) < 0 ? "text-danger" : "text-ink"}`}>{formatPeso(selectorRealized(all))}</Text><Text className="text-[12px] text-inkfaint">realized</Text></View>
            <View><Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[17px] text-ink">{all.length}</Text><Text className="text-[12px] text-inkfaint">items</Text></View>
            <View><Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[17px] text-ink">{all.filter((i) => i.status === "sold").length}</Text><Text className="text-[12px] text-inkfaint">sold</Text></View>
          </View>
        </View>
      ) : (
        <View className="py-3">
          <Text style={{ fontFamily: FONT.semibold, letterSpacing: 1 }} className="text-[11.5px] uppercase text-inkfaint">Capital recovered</Text>
          <Text style={{ fontFamily: FONT.displayBlack, fontVariant: ["tabular-nums"] }} className="text-[34px] text-acid">{realPct == null ? "—" : formatPct(realPct)}</Text>
          <View className="my-3 h-3 overflow-visible rounded-full border border-hairline bg-surface2">
            <View className="h-full rounded-full bg-acid" style={{ width: `${Math.min(100, realPct ?? 0)}%` }} />
          </View>
          <View className="flex-row justify-between">
            <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="text-[12px] text-inkfaint">
              <Text className="text-inkdim">{formatPeso(soldRevenue(all))}</Text> of {formatPeso(session.totalBaleCost ?? 0)} bale
            </Text>
            <Text className="text-[12px] text-inkfaint">break-even ›</Text>
          </View>
          <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="mt-1.5 text-[12px] text-inkfaint">
            Projected if all sells at target: <Text style={{ fontFamily: FONT.bold }} className="text-acid">{projPct == null ? "—" : `${formatPct(projPct)} · ${formatPeso(all.reduce((a, i) => a + i.targetSellPrice, 0))}`}</Text>
          </Text>
        </View>
      )}

      <View className="flex-row gap-2 py-1">
        {(["all", "available", "sold"] as const).map((f) => (
          <Chip key={f} label={f[0].toUpperCase() + f.slice(1)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
        <View className="flex-1" />
        <Chip label="Export" selected={false} onPress={() => router.push(`/session/${id}/export`)} />
      </View>

      <FlashList
        data={visible}
        keyExtractor={(i: Item) => i.id}
        style={{ flex: 1 }}
        renderItem={({ item }: { item: Item }) => {
          const uri = thumbOf(item.id);
          return (
            <Pressable onPress={() => router.push(`/item/${item.id}`)} className="flex-row items-center gap-3 border-b border-hairline py-3">
              <View className={`h-16 w-16 items-center justify-center rounded-[10px] border border-hairline bg-surface2 ${item.status === "sold" ? "opacity-45" : ""}`}>
                {uri ? <Image source={{ uri }} recyclingKey={uri} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
                     : <Text style={{ fontFamily: FONT.bold }} className="text-[20px] text-inkfaint">{item.brand[0]}</Text>}
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text style={{ fontFamily: FONT.semibold }} className={`text-[17px] ${item.status === "sold" ? "text-inkdim" : "text-ink"}`} numberOfLines={1}>{item.brand}</Text>
                  {item.status === "sold" ? <Badge label="SOLD" tone="sold" /> : null}
                </View>
                <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="mt-0.5 text-[12px] text-inkfaint">
                  {item.category} · {item.condition} · PTP {formatInches(item.ptpInches)} · L {formatInches(item.lengthInches)}
                </Text>
              </View>
              <View className="items-end">
                <Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[17px] text-ink">{formatPeso(item.soldPrice ?? item.targetSellPrice)}</Text>
                {item.status === "sold" && item.soldPrice !== item.targetSellPrice
                  ? <Text style={{ fontFamily: FONT.medium, fontVariant: ["tabular-nums"] }} className="text-[11px] text-inkfaint">listed {formatPeso(item.targetSellPrice)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-10">
            <Text style={{ fontFamily: FONT.text }} className="text-[13.5px] text-inkdim">No items yet — hit ＋ and log your first find.</Text>
          </View>
        }
      />
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label="＋  Add Item" onPress={() => router.push(`/session/${id}/add`)} />
      </View>
    </View>
  );
}
