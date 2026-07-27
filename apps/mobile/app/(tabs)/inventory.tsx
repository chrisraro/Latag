import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, RefreshControl, ScrollView, TextInput } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc } from "drizzle-orm";
import { db } from "../../db/client";
import { items, photos, type Item } from "../../db/schema";
import { FONT, COLORS } from "../../lib/theme";
import { formatPeso } from "../../lib/format";
import { DEPARTMENTS, captionSpecLine, type CatalogItem } from "../../lib/catalog";
import { DEFAULT_FILTER, filterItems, inventoryTotals, type InvFilter, type InvSort, type InvStatus } from "../../lib/inventory";
import { Badge, Chip, Money } from "../../components/ui";
import { AppHead } from "../../components/AppHead";
import { Icon } from "../../components/Icon";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { useTabScrollToTop } from "../../lib/tab-scroll";
import { REFRESH_TINT, settle, useRefresh } from "../../lib/refresh";

const STATUSES: InvStatus[] = ["all", "available", "sold"];
const STATUS_LABEL: Record<InvStatus, string> = { all: "All", available: "Available", sold: "Sold" };

/** The sort chip is a cycle, not a menu — one tap moves to the next mode. */
const SORT_CYCLE: InvSort[] = ["newest", "price-high", "price-low", "oldest"];
const SORT_LABEL: Record<InvSort, string> = { newest: "Newest", "price-high": "₱ High", "price-low": "₱ Low", oldest: "Oldest" };

/**
 * Inventory — every item ever logged, across every batch, searchable and
 * sortable. Rows are deliberately identical to the batch dashboard's so the
 * same piece looks the same wherever you meet it. (G1 moved this off `/`;
 * Home owns the first screen now.)
 */
export default function InventoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<InvFilter>(DEFAULT_FILTER);
  // Bumped by a pull-to-refresh; it is the dependency of the live queries below,
  // so changing it re-runs each read against the file on disk.
  const [reread, setReread] = useState(0);
  const listRef = useRef<FlashListRef<Item>>(null);
  useTabScrollToTop("inventory", useCallback(() => {
    if (!listRef.current) return false;
    listRef.current.scrollToOffset({ offset: 0, animated: true });
    return true;
  }, []));

  const { data: itemRows } = useLiveQuery(db.select().from(items).orderBy(desc(items.createdAt)), [reread]);
  const { data: photoRows } = useLiveQuery(db.select().from(photos), [reread]);

  const all = itemRows ?? [];

  // Pull-to-refresh: re-read the local tables, and nothing else. The outbox
  // drain deliberately lives on Home and Shop — the two tabs that actually show
  // the queue's state — because importing it here would drag the Supabase auth
  // client into a screen that is offline-first by law (see lib/supabase.ts).
  const { refreshing, onRefresh } = useRefresh(
    useCallback(async () => {
      setReread((n) => n + 1);
      await settle();
    }, []),
  );

  const filterActive =
    filter.query !== DEFAULT_FILTER.query ||
    filter.department !== DEFAULT_FILTER.department ||
    filter.status !== DEFAULT_FILTER.status ||
    filter.batch !== DEFAULT_FILTER.batch ||
    filter.sort !== DEFAULT_FILTER.sort;
  const visible = useMemo(() => filterItems(all, filter), [itemRows, filter]);
  const totals = useMemo(() => inventoryTotals(visible), [visible]);
  const thumbs = useMemo(
    () => new Map((photoRows ?? []).filter((p) => p.type === "front").map((p) => [p.itemId, p.localUri])),
    [photoRows],
  );
  const thumbOf = (itemId: string) => thumbs.get(itemId) ?? null;
  const cycleSort = () => setFilter((f) => ({ ...f, sort: SORT_CYCLE[(SORT_CYCLE.indexOf(f.sort) + 1) % SORT_CYCLE.length] }));

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead
        title="Inventory"
        right={<Badge label={String(all.length)} />}
        onSettings={() => router.push("/settings")}
      />

      <Text
        style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 17 }}
        className="mb-3 text-[12px] text-inkfaint"
        numberOfLines={1}
      >
        {filterActive
          ? `Showing ${visible.length} of ${all.length} · ${formatPeso(totals.stockValue)} in this view`
          : `${totals.count} ${totals.count === 1 ? "item" : "items"} · ${totals.available} available · ${formatPeso(totals.stockValue)} stock value`}
      </Text>

      <View className="mb-2.5 h-[52px] flex-row items-center gap-2.5 rounded-[14px] border border-hairline bg-surface2 px-4">
        <Icon name="MagnifyingGlass" size={16} color={COLORS.inkFaint} />
        <TextInput
          value={filter.query}
          onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
          accessibilityLabel="Search inventory"
          placeholder="Search brand, name, category"
          placeholderTextColor={COLORS.inkFaint}
          autoCorrect={false}
          returnKeyType="search"
          style={{ fontFamily: FONT.text }}
          className="h-full flex-1 text-[15px] text-ink"
        />
        {filter.query.length > 0 ? (
          <Pressable
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setFilter((f) => ({ ...f, query: "" }))}
            className="h-6 w-6 items-center justify-center rounded-full bg-surface1"
          >
            <Icon name="X" size={12} color={COLORS.inkFaint} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        className="mb-2.5"
      >
        <Chip label="All" selected={filter.department === "all"} onPress={() => setFilter((f) => ({ ...f, department: "all" }))} />
        {DEPARTMENTS.map((d) => (
          <Chip key={d.key} label={d.label} selected={filter.department === d.key} onPress={() => setFilter((f) => ({ ...f, department: d.key }))} />
        ))}
      </ScrollView>

      <View className="mb-2.5 flex-row items-center gap-2">
        {/* Status plus the batch facet scroll — four chips plus the sort chip
            overflow a narrow phone — while sort stays pinned to the right. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {STATUSES.map((s) => (
            <Chip key={s} label={STATUS_LABEL[s]} selected={filter.status === s} onPress={() => setFilter((f) => ({ ...f, status: s }))} />
          ))}
          {/* Items with no batch (G2). Tapping it again clears the facet. */}
          <Chip
            label="Loose items"
            selected={filter.batch === "none"}
            onPress={() => setFilter((f) => ({ ...f, batch: f.batch === "none" ? "all" : "none" }))}
          />
        </ScrollView>
        <View className="flex-1" />
        {/* Acid only once you've moved off the default, so the chip reads as state, not decoration. */}
        <Chip label={SORT_LABEL[filter.sort]} selected={filter.sort !== DEFAULT_FILTER.sort} onPress={cycleSort} />
      </View>

      <FlashList
        ref={listRef}
        data={visible}
        keyExtractor={(i: Item) => i.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} {...REFRESH_TINT} />}
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
          <View className="items-center px-1 py-8">
            <View style={{ borderRadius: 12 }} className="w-full items-center border-[1.5px] border-dashed border-hairline px-6 py-8">
              <Text style={{ fontFamily: FONT.text, lineHeight: 18 }} className="text-center text-[13px] text-inkfaint">
                {all.length === 0 ? "No items yet — tap + to log your first piece." : "No items match these filters."}
              </Text>
            </View>
          </View>
        }
      />
    </View>
  );
}
