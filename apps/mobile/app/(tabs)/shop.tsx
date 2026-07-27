import { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, Share } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, isNotNull } from "drizzle-orm";
import * as Clipboard from "expo-clipboard";
import { db } from "../../db/client";
import { entitlements, items, photos, publishQueue, type Item } from "../../db/schema";
import { cacheShop, cachedShop, getMyShop, shopUrl, shopUrlLabel, type ShopProfile } from "../../lib/shop-api";
import { MAX_ATTEMPTS, pendingLabel } from "../../lib/shop-sync";
import { showSuccess } from "../../lib/toast";
import { FONT, COLORS } from "../../lib/theme";
import { Badge, Money, PrimaryButton, SecondaryButton } from "../../components/ui";
import { AppHead } from "../../components/AppHead";
import { Icon } from "../../components/Icon";
import { GoProSheet } from "../../components/GoProSheet";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { useTabScrollToTop } from "../../lib/tab-scroll";

/**
 * Shop — three honest states and no dead end in any of them:
 *   1. Free      → the pitch + the Pro gate (GoProSheet).
 *   2. Pro, none → the same pitch, wired to /shop/setup.
 *   3. Pro, shop → the link, the counts, the queue's truth, the listings.
 *
 * Everything except the seller's handle comes from the local database, so a
 * dropped connection costs the link only — and even that is served from the
 * last-known profile cache before it costs anything at all.
 */

/** undefined = still loading; null = definitively no shop. */
type Profile = ShopProfile | null | undefined;

function ValueCard({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-card border border-hairline bg-surface1" style={{ padding: 18 }}>
      <View className="h-11 w-11 items-center justify-center rounded-[12px] bg-surface2">
        <Icon name="Storefront" size={22} color={COLORS.acid} />
      </View>
      <Text style={{ fontFamily: FONT.display }} className="mt-3.5 text-[18px] text-ink">
        Your own shop page
      </Text>
      <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="mt-2 text-[13px] text-inkdim">
        Publish items to a public page buyers can browse — share one link on FB, IG, or Messenger.
      </Text>
      <Text style={{ fontFamily: FONT.text, lineHeight: 18 }} className="mt-2.5 text-[12.5px] text-inkfaint">
        Only the items you pick get published. Costs, profit and pinned spots stay on this phone.
      </Text>
      {children}
    </View>
  );
}

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [proSheet, setProSheet] = useState(false);
  const [profile, setProfile] = useState<Profile>(undefined);
  const [stale, setStale] = useState(false); // showing the cached copy, not a fresh read
  const [failed, setFailed] = useState(false); // unreachable AND nothing cached
  const [loading, setLoading] = useState(false);
  // Only the listings state renders a list; in the other states this is a no-op.
  const listRef = useRef<FlashListRef<Item>>(null);
  useTabScrollToTop("shop", useCallback(() => {
    if (!listRef.current) return false;
    listRef.current.scrollToOffset({ offset: 0, animated: true });
    return true;
  }, []));

  const { data: entRows } = useLiveQuery(db.select().from(entitlements), []);
  const { data: publishedRows } = useLiveQuery(
    db.select().from(items).where(isNotNull(items.publishedAt)).orderBy(desc(items.publishedAt)),
    [],
  );
  const { data: photoRows } = useLiveQuery(db.select().from(photos), []);
  const { data: queueRows } = useLiveQuery(db.select().from(publishQueue), []);

  const pro = entRows?.[0]?.pro === true;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getMyShop();
    if (res.ok) {
      setProfile(res.data);
      setStale(false);
      setFailed(false);
      void cacheShop(res.data);
    } else {
      // Offline or signed out: the last shop we saw beats an empty screen, and
      // saying so beats pretending the read was fresh.
      const cached = await cachedShop();
      setStale(true);
      setProfile((prev) => prev ?? cached);
      setFailed(cached == null);
    }
    setLoading(false);
  }, []);

  // Refetch on focus so a save in /shop/setup is reflected the moment it closes.
  useFocusEffect(
    useCallback(() => {
      if (pro) void load();
    }, [pro, load]),
  );

  const published = publishedRows ?? [];
  const soldCount = published.filter((i) => i.status === "sold").length;
  const queue = queueRows ?? [];
  const stuck = queue.filter((q) => q.attempts >= MAX_ATTEMPTS).length;
  const pending = queue.length - stuck;
  const thumbs = new Map((photoRows ?? []).filter((p) => p.type === "front").map((p) => [p.itemId, p.localUri]));

  const link = profile ? shopUrl(profile.handle) : "";

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(link);
      showSuccess("Link copied");
    } catch {
      showSuccess("Couldn't copy — your link is " + shopUrlLabel(profile?.handle ?? ""));
    }
  };

  const shareLink = async () => {
    try {
      await Share.share({ message: `${profile?.displayName ?? "My shop"} — ${link}` });
    } catch {
      // The seller dismissed the sheet, or it failed to open. Copy still works.
    }
  };

  // The entitlements row is created at launch; this is the frame before the
  // live query first resolves. Guessing "free" here would flash the Pro gate.
  if (!entRows?.[0]) return null;

  // --- State 1: free ------------------------------------------------------
  if (!pro) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
        <AppHead title="Shop" onSettings={() => router.push("/settings")} />
        <View className="flex-1 justify-center" style={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
          <ValueCard>
            <PrimaryButton label="Unlock with Pro" onPress={() => setProSheet(true)} />
          </ValueCard>
        </View>
        <GoProSheet visible={proSheet} onClose={() => setProSheet(false)} />
      </View>
    );
  }

  // --- Unreachable, with nothing cached to fall back to --------------------
  if (failed && !profile) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
        <AppHead title="Shop" onSettings={() => router.push("/settings")} />
        <View className="flex-1 justify-center" style={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
          <View className="rounded-card border border-hairline bg-surface1" style={{ padding: 18 }}>
            <Text style={{ fontFamily: FONT.display }} className="text-[17px] text-ink">Couldn&apos;t load your shop</Text>
            <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="mt-2 text-[13px] text-inkdim">
              You&apos;re offline, or the connection dropped. Everything you&apos;ve logged is safe on this phone.
            </Text>
            <View className="mt-4 flex-row">
              <SecondaryButton label="Retry" icon="ArrowsClockwise" busy={loading} onPress={() => { if (!loading) void load(); }} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  // --- Still reading ------------------------------------------------------
  if (profile === undefined) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
        <AppHead title="Shop" onSettings={() => router.push("/settings")} />
        <View className="flex-1 justify-center" style={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
          <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="text-center text-[13px] text-inkfaint">
            Loading your shop…
          </Text>
        </View>
      </View>
    );
  }

  // --- State 2: Pro, no shop yet ------------------------------------------
  if (profile === null) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
        <AppHead title="Shop" onSettings={() => router.push("/settings")} />
        <View className="flex-1 justify-center" style={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
          <ValueCard>
            <PrimaryButton label="Set up my shop" icon="Storefront" onPress={() => router.push("/shop/setup")} />
          </ValueCard>
        </View>
      </View>
    );
  }

  // --- State 3: the shop exists ------------------------------------------
  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead
        title="Shop"
        right={<Badge label={String(published.length)} />}
        onSettings={() => router.push("/settings")}
      />
      <FlashList
        data={published}
        keyExtractor={(i: Item) => i.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        ListHeaderComponent={
          <View className="mb-4 rounded-card border border-hairline bg-surface1" style={{ padding: 18 }}>
            <Text style={{ fontFamily: FONT.display }} className="text-[18px] text-ink" numberOfLines={1}>
              {profile.displayName}
            </Text>
            {/* An offline shop is a 404 for buyers (RLS reads shops.is_published),
                so showing the link — let alone offering to share it — would be a
                lie. Say what is true and point at the switch. */}
            {profile.isPublished ? (
              <Text
                selectable
                style={{ fontFamily: FONT.semibold, lineHeight: 19 }}
                className="mt-1.5 text-[13px] text-acid"
                numberOfLines={1}
              >
                {shopUrlLabel(profile.handle)}
              </Text>
            ) : (
              <>
                <Text style={{ fontFamily: FONT.semibold, lineHeight: 19 }} className="mt-1.5 text-[13px] text-danger">
                  Your shop is switched off
                </Text>
                <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="mt-1 text-[12px] text-inkdim">
                  Buyers who open your link see a not-found page. Turn it back on in Edit shop.
                </Text>
              </>
            )}
            <Text
              style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 17 }}
              className="mt-2.5 text-[12px] text-inkfaint"
            >
              {`${published.length} published · ${soldCount} sold`}
            </Text>
            {pending > 0 ? (
              <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className="mt-1 text-[11.5px] text-inkfaint">
                {pendingLabel(pending)} — syncs when you&apos;re online
              </Text>
            ) : null}
            {stuck > 0 ? (
              <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className="mt-1 text-[11.5px] text-danger">
                {stuck === 1
                  ? "1 change couldn't sync — open the item and switch Publish off, then on"
                  : `${stuck} changes couldn't sync — open those items and switch Publish off, then on`}
              </Text>
            ) : null}
            {stale ? (
              <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className="mt-1 text-[11.5px] text-inkfaint">
                Offline — showing your last saved shop
              </Text>
            ) : null}
            {profile.isPublished ? (
              <View className="mt-4 flex-row gap-2">
                <SecondaryButton label="Copy link" icon="ClipboardText" onPress={() => void copyLink()} />
                <SecondaryButton label="Share" icon="ShareNetwork" onPress={() => void shareLink()} />
              </View>
            ) : null}
            <View className={`${profile.isPublished ? "mt-2" : "mt-4"} flex-row`}>
              <SecondaryButton label="Edit shop" icon="PencilSimple" onPress={() => router.push("/shop/setup?edit=1")} />
            </View>
          </View>
        }
        renderItem={({ item }: { item: Item }) => {
          const uri = thumbs.get(item.id) ?? null;
          const sold = item.status === "sold";
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.brand}${item.name ? ` ${item.name}` : ""}, ${item.shopCode ?? "published"}`}
              onPress={() => router.push(`/item/${item.id}`)}
              className="flex-row items-center gap-3 border-b border-hairline px-3 py-3.5"
            >
              <View className={`h-14 w-14 items-center justify-center rounded-[10px] border border-hairline bg-surface2 ${sold ? "opacity-45" : ""}`}>
                {uri ? (
                  <Image source={{ uri }} recyclingKey={uri} style={{ width: 56, height: 56, borderRadius: 10 }} contentFit="cover" />
                ) : (
                  <Text style={{ fontFamily: FONT.bold }} className="text-[18px] text-inkfaint">{item.brand[0]}</Text>
                )}
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontFamily: FONT.semibold }} className={`min-w-0 shrink text-[16px] ${sold ? "text-inkdim" : "text-ink"}`} numberOfLines={1}>
                    {item.brand}
                    {item.name ? <Text className="text-inkdim"> · {item.name}</Text> : null}
                  </Text>
                  {sold ? <Badge label="SOLD" tone="sold" /> : null}
                </View>
                <Text
                  style={{ fontFamily: FONT.medium, fontVariant: ["tabular-nums"], lineHeight: 17 }}
                  className="mt-1 text-[12px] text-inkfaint"
                  numberOfLines={1}
                >
                  {item.shopCode ?? "Publishing…"}
                </Text>
              </View>
              <Money value={item.targetSellPrice} size="row" />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ borderRadius: 12 }} className="items-center border-[1.5px] border-dashed border-hairline px-6 py-8">
            <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="text-center text-[13px] text-inkfaint">
              Nothing published yet — open an item and turn on Publish to shop.
            </Text>
          </View>
        }
      />
    </View>
  );
}
