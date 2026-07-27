import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, View, Text, Pressable, RefreshControl, ScrollView, TextInput } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc } from "drizzle-orm";
import { db } from "../../db/client";
import { entitlements, items, photos, type Item } from "../../db/schema";
import { FONT, COLORS } from "../../lib/theme";
import { formatPeso } from "../../lib/format";
import { DEPARTMENTS, captionSpecLine, type CatalogItem } from "../../lib/catalog";
import { DEFAULT_FILTER, filterItems, inventoryTotals, type InvFilter, type InvSort, type InvStatus } from "../../lib/inventory";
import { itemSwipeActions, type ItemActionKey } from "../../lib/swipe-actions";
import { enqueuePublish, generateShopCode, markPublished, markSold, markUnpublished, unmarkSold } from "../../lib/repo";
import { kickSync } from "../../lib/shop-sync";
import { cachedShop } from "../../lib/shop-api";
import { showSuccess } from "../../lib/toast";
import { Badge, Chip, Money } from "../../components/ui";
import { AppHead } from "../../components/AppHead";
import { Icon } from "../../components/Icon";
import { SwipeRow, type SwipeBinding } from "../../components/SwipeRow";
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
  const { data: entRows } = useLiveQuery(db.select().from(entitlements), []);
  const pro = entRows?.[0]?.pro === true;

  const all = itemRows ?? [];

  // Whether a storefront exists at all, read from the last cached profile —
  // AsyncStorage only, so the swipe knows the answer in a market with no signal
  // and this screen never issues a request of its own. A seller who has never
  // opened the Shop tab has no cache and is simply not offered Publish here;
  // item detail, which does hit the network, remains the authority.
  const [hasShop, setHasShop] = useState(false);
  useEffect(() => {
    if (!pro) { setHasShop(false); return; }
    let alive = true;
    void cachedShop().then((s) => { if (alive) setHasShop(s != null); });
    return () => { alive = false; };
  }, [pro]);

  // Pull-to-refresh: re-read the local tables, and nothing else. The outbox
  // drain deliberately lives on Home and Shop — the two tabs that actually show
  // the queue's state — so a pull here never blocks on anything. (A publish or
  // unpublish fired from a swipe nudges the queue itself, below.)
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

  /**
   * Takes a listing down and makes sure the internet hears about it now, rather
   * than whenever the app next backgrounds — without the nudge the toast would
   * be a false statement about a page buyers can still open.
   */
  const takeDown = (id: string) => {
    markUnpublished(db, id);
    enqueuePublish(db, id, "delete");
    kickSync(db);
    showSuccess("Removed from shop");
  };

  /**
   * Runs one swiped action. Every branch here honours the guard declared in
   * `lib/swipe-actions`: `confirm` opens a dialog first, `undo` does the work
   * and hands back a one-tap reversal. Nothing fires silently.
   */
  const runSwipe = (key: ItemActionKey, item: Item) => {
    switch (key) {
      case "markSold":
        // At the asking price — the swipe is the fast path; the sold screen is
        // still there when the price was haggled down.
        markSold(db, item.id, item.targetSellPrice);
        showSuccess(`Sold at ${formatPeso(item.targetSellPrice)} — tap to undo`, {
          onPress: () => { unmarkSold(db, item.id); },
        });
        return;
      case "undoSold":
        Alert.alert("Undo this sale?", "The sold price and the date it sold on are cleared.", [
          { text: "Cancel", style: "cancel" },
          { text: "Undo sold", style: "destructive", onPress: () => { unmarkSold(db, item.id); showSuccess("Back in stock"); } },
        ]);
        return;
      case "publish":
        // Codes are permanent: a republished item keeps the one buyers already
        // have from a screenshot or a message thread.
        markPublished(db, item.id, item.shopCode ?? generateShopCode(db));
        enqueuePublish(db, item.id, "upsert");
        kickSync(db);
        showSuccess("Publishing — tap to undo", { onPress: () => takeDown(item.id) });
        return;
      case "unpublish":
        Alert.alert("Remove from shop?", "Buyers stop seeing this item. You can publish it again later.", [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: () => takeDown(item.id) },
        ]);
        return;
    }
  };

  const swipeBindings = (item: Item): SwipeBinding<ItemActionKey>[] =>
    itemSwipeActions(item, { pro, hasShop }).map((a) => ({ ...a, onPress: () => runSwipe(a.key, item) }));

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
            // Drag the row for the sold toggle and the storefront; tapping it
            // still opens the item, where every one of those lives permanently.
            <SwipeRow actions={swipeBindings(item)}>
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
            </SwipeRow>
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
