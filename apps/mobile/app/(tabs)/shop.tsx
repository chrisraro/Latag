import { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, RefreshControl, ScrollView, Alert, type ScrollViewProps } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db } from "../../db/client";
import { type Item } from "../../db/schema";
import { shopUrlLabel } from "../../lib/shop-api";
import { pendingLabel } from "../../lib/shop-sync";
import { FONT, COLORS } from "../../lib/theme";
import { Badge, Money, PrimaryButton, SecondaryButton } from "../../components/ui";
import { AppHead } from "../../components/AppHead";
import { Icon } from "../../components/Icon";
import { GoProSheet } from "../../components/GoProSheet";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { useTabScrollToTop } from "../../lib/tab-scroll";
import { REFRESH_TINT } from "../../lib/refresh";
import { useShopViewModel, type Listing } from "../../hooks/useShopViewModel";
import { restorePublishedItems } from "../../lib/shop-restore";
import { showSuccess, showError } from "../../lib/toast";

/**
 * Shop — three honest states and no dead end in any of them:
 *   1. Free      → the pitch + the Pro gate (GoProSheet).
 *   2. Pro, none → the same pitch, wired to /shop/setup.
 *   3. Pro, shop → the link, the counts, the queue's truth, the listings.
 *
 * All data logic lives in useShopViewModel. This component is pure presentation.
 */

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

function Centered({
  bottom,
  refreshControl,
  children,
}: {
  bottom: number;
  refreshControl: ScrollViewProps["refreshControl"];
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: bottom }}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [proSheet, setProSheet] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const listRef = useRef<FlashListRef<Listing>>(null);

  const vm = useShopViewModel();

  // --- Restore from published shop listings ---
  const handleSyncFromPublished = useCallback(() => {
    if (syncing) return;
    Alert.alert(
      "Restore from your shop",
      "Pull your published listings back from your shop? This adds any items that aren't already on this phone. Photos will need re-taking — only listing info (brand, name, price, code) is restored.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            setSyncing(true);
            try {
              const result = await restorePublishedItems(db);
              if (result.restored > 0) {
                showSuccess(`Restored ${result.restored} listing${result.restored === 1 ? "" : "s"} from your shop`);
                vm.refresh();
              } else if (result.skipped > 0) {
                showSuccess("All your listings are already on this phone");
              } else {
                showError("No published listings found — publish items first");
              }
            } catch {
              showError("Couldn't restore — check your connection and try again");
            } finally {
              setSyncing(false);
            }
          },
        },
      ],
    );
  }, [syncing, vm]);

  useTabScrollToTop("shop", useCallback(() => {
    if (!listRef.current) return false;
    listRef.current.scrollToOffset({ offset: 0, animated: true });
    return true;
  }, []));

  const refreshControl = <RefreshControl refreshing={false} onRefresh={vm.refresh} {...REFRESH_TINT} />;

  const soldCount = vm.listings.filter((i) => i.status === "sold").length;
  const pending = vm.queued;
  const stuck = 0; // TODO: derive from queue if needed

  // --- State 1: free ----------------------------------------------------
  if (!vm.pro) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
        <AppHead title="Shop" onSettings={() => router.push("/settings")} />
        <Centered bottom={insets.bottom + TAB_BAR_CLEARANCE} refreshControl={refreshControl}>
          <ValueCard>
            <PrimaryButton label="Unlock with Pro" onPress={() => setProSheet(true)} />
          </ValueCard>
        </Centered>
        <GoProSheet visible={proSheet} onClose={() => setProSheet(false)} />
      </View>
    );
  }

  // --- Unreachable, nothing cached --------------------------------------
  if (vm.failed && !vm.profile) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
        <AppHead title="Shop" onSettings={() => router.push("/settings")} />
        <Centered bottom={insets.bottom + TAB_BAR_CLEARANCE} refreshControl={refreshControl}>
          <View className="rounded-card border border-hairline bg-surface1" style={{ padding: 18 }}>
            <Text style={{ fontFamily: FONT.display }} className="text-[17px] text-ink">Couldn&apos;t load your shop</Text>
            <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="mt-2 text-[13px] text-inkdim">
              You&apos;re offline, or the connection dropped. Everything you&apos;ve logged is safe on this phone.
            </Text>
            <View className="mt-4 flex-row">
              <SecondaryButton label="Retry" icon="ArrowsClockwise" busy={vm.loading} onPress={() => { if (!vm.loading) vm.refresh(); }} />
            </View>
          </View>
        </Centered>
      </View>
    );
  }

  // --- Still reading ----------------------------------------------------
  if (vm.profile === undefined) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
        <AppHead title="Shop" onSettings={() => router.push("/settings")} />
        <Centered bottom={insets.bottom + TAB_BAR_CLEARANCE} refreshControl={refreshControl}>
          <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="text-center text-[13px] text-inkfaint">
            Loading your shop…
          </Text>
        </Centered>
      </View>
    );
  }

  // --- State 2: Pro, no shop yet ----------------------------------------
  if (vm.profile === null) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
        <AppHead title="Shop" onSettings={() => router.push("/settings")} />
        <Centered bottom={insets.bottom + TAB_BAR_CLEARANCE} refreshControl={refreshControl}>
          <ValueCard>
            <PrimaryButton label="Set up my shop" icon="Storefront" onPress={() => router.push("/shop/setup")} />
          </ValueCard>
        </Centered>
      </View>
    );
  }

  // --- State 3: the shop exists ----------------------------------------
  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead
        title="Shop"
        right={<Badge label={String(vm.listings.length)} />}
        onSettings={() => router.push("/settings")}
      />
      <FlashList
        data={vm.listings}
        keyExtractor={(i: Listing) => i.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        refreshControl={refreshControl}
        ListHeaderComponent={
          <View className="mb-4 rounded-card border border-hairline bg-surface1" style={{ padding: 18 }}>
            <Text style={{ fontFamily: FONT.display }} className="text-[18px] text-ink" numberOfLines={1}>
              {vm.profile.displayName}
            </Text>
            {vm.profile.isPublished ? (
              <Text
                selectable
                style={{ fontFamily: FONT.semibold, lineHeight: 19 }}
                className="mt-1.5 text-[13px] text-acid"
                numberOfLines={1}
              >
                {shopUrlLabel(vm.profile.handle)}
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
              {`${vm.listings.length} published · ${soldCount} sold`}
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
            {vm.stale ? (
              <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className="mt-1 text-[11.5px] text-inkfaint">
                Offline — showing your last saved shop
              </Text>
            ) : null}
            {vm.profile.isPublished ? (
              <View className="mt-4 flex-row gap-2">
                <SecondaryButton label="Copy link" icon="ClipboardText" onPress={() => void vm.copyLink()} />
                <SecondaryButton label="Share" icon="ShareNetwork" onPress={() => void vm.shareLink()} />
              </View>
            ) : null}
            <View className={`${vm.profile.isPublished ? "mt-2" : "mt-4"} flex-row`}>
              <SecondaryButton label="Edit shop" icon="PencilSimple" onPress={() => router.push("/shop/setup?edit=1")} />
            </View>
            <View className="mt-2 flex-row">
              <SecondaryButton
                label={syncing ? "Restoring…" : "Restore from published"}
                icon="CloudArrowDown"
                busy={syncing}
                onPress={() => handleSyncFromPublished()}
              />
            </View>
          </View>
        }
        renderItem={({ item }: { item: Listing }) => {
          const uri = item.frontPhoto;
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
