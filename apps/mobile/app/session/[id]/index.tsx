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
import { FONT, COLORS } from "../../../lib/theme";
import { formatPeso, formatPct } from "../../../lib/format";
import { captionSpecLine, type CatalogItem } from "../../../lib/catalog";
import { selectorProjected, selectorRealized, bultoProjectedPct, bultoRealizedPct, soldRevenue } from "../../../lib/math";
import { Badge, Chip, Money, PrimaryButton } from "../../../components/ui";
import { AppHead } from "../../../components/AppHead";
import { Icon } from "../../../components/Icon";

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
  const projected = selectorProjected(all);
  const realized = selectorRealized(all);

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead
        title={session.name}
        onBack={() => router.back()}
        right={<Badge label={session.type.toUpperCase()} />}
      />

      {session.type === "selector" ? (
        <View style={{ paddingTop: 12, paddingBottom: 8 }}>
          <Text style={{ fontFamily: FONT.medium, lineHeight: 18 }} className="mb-1 text-[13px] text-inkfaint">PROJECTED PROFIT</Text>
          <Money value={projected} size="hero" negative={projected < 0} />
          <View className="mt-3 flex-row gap-6">
            <View>
              <Money value={realized} size="row" negative={realized < 0} />
              <Text style={{ lineHeight: 17 }} className="mt-0.5 text-[12px] text-inkfaint">realized</Text>
            </View>
            <View>
              <Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[17px] text-ink">{all.length}</Text>
              <Text style={{ lineHeight: 17 }} className="mt-0.5 text-[12px] text-inkfaint">items</Text>
            </View>
            <View>
              <Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[17px] text-ink">{all.filter((i) => i.status === "sold").length}</Text>
              <Text style={{ lineHeight: 17 }} className="mt-0.5 text-[12px] text-inkfaint">sold</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ paddingTop: 8, paddingBottom: 2 }}>
          <Text style={{ fontFamily: FONT.medium, lineHeight: 18 }} className="mb-1 text-[13px] text-inkfaint">CAPITAL RECOVERED</Text>
          <Text style={{ fontFamily: FONT.displayBlack, fontVariant: ["tabular-nums"] }} className="text-[34px] text-acid">{realPct == null ? "—" : formatPct(realPct)}</Text>
          <View style={{ marginTop: 12, marginBottom: 6 }} className="h-3 overflow-visible rounded-full border border-hairline bg-surface2">
            <View className="h-full rounded-full bg-acid" style={{ width: `${Math.max(0, Math.min(100, realPct ?? 0))}%` }} />
            <View style={{ position: "absolute", top: -5, bottom: -5, right: 0, width: 2 }} className="bg-inkdim" />
          </View>
          <View className="flex-row justify-between gap-3">
            <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 17 }} className="text-[12px] text-inkfaint">
              <Text style={{ fontFamily: FONT.text }} className="text-inkdim">{formatPeso(soldRevenue(all))}</Text> of {formatPeso(session.totalBaleCost ?? 0)} bale
            </Text>
            <View className="flex-row items-center gap-[3px]">
              <Text style={{ lineHeight: 17 }} className="text-[12px] text-inkfaint">break-even</Text>
              <Icon name="CaretRight" size={12} color={COLORS.inkFaint} />
            </View>
          </View>
          <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 17, marginTop: 6, paddingTop: 8, paddingBottom: 2 }} className="text-[12px] text-inkfaint">
            Projected if all sells at target: <Text style={{ fontFamily: FONT.semibold }} className="text-acid">{projPct == null ? "—" : `${formatPct(projPct)} · ${formatPeso(all.reduce((a, i) => a + i.targetSellPrice, 0))}`}</Text>
          </Text>
        </View>
      )}

      <View className="mb-2.5 flex-row gap-2 py-1" style={{ marginTop: 12 }}>
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
          const spec = captionSpecLine(item as CatalogItem);
          return (
            <Pressable onPress={() => router.push(`/item/${item.id}`)} className="flex-row items-center gap-3 border-b border-hairline px-3 py-3.5">
              <View className={`h-16 w-16 items-center justify-center rounded-[10px] border border-hairline bg-surface2 ${item.status === "sold" ? "opacity-45" : ""}`}>
                {uri ? <Image source={{ uri }} recyclingKey={uri} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
                     : <Text style={{ fontFamily: FONT.bold }} className="text-[20px] text-inkfaint">{item.brand[0]}</Text>}
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontFamily: FONT.semibold }} className={`min-w-0 shrink text-[17px] ${item.status === "sold" ? "text-inkdim" : "text-ink"}`} numberOfLines={1}>
                    {item.brand}
                    {item.name ? <Text className="text-inkdim"> · {item.name}</Text> : null}
                  </Text>
                  {item.status === "sold" ? <Badge label="SOLD" tone="sold" /> : null}
                </View>
                <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 17 }} className="mt-1 text-[12px] text-inkfaint" numberOfLines={1}>
                  {item.category} · {item.condition}{spec ? ` · ${spec}` : ""}
                </Text>
              </View>
              <View className="ml-1 items-end">
                <Money value={item.soldPrice ?? item.targetSellPrice} size="row" />
                {item.status === "sold" && item.soldPrice !== item.targetSellPrice
                  ? <Text style={{ fontFamily: FONT.medium, fontVariant: ["tabular-nums"], lineHeight: 15 }} className="mt-0.5 text-[11px] text-inkfaint">listed {formatPeso(item.targetSellPrice)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-10">
            <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="text-[13.5px] text-inkdim">No items yet — hit ＋ and log your first find.</Text>
          </View>
        }
      />
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label="Add Item" icon="Plus" onPress={() => router.push(`/session/${id}/add`)} />
      </View>
    </View>
  );
}
