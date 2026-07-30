import { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { type Item, type Session } from "../../db/schema";
import { formatPeso } from "../../lib/format";
import { formatCountdown, formatScheduleStamp } from "../../lib/schedule";
import { pendingLabel } from "../../lib/shop-sync";
import { shopUrlLabel } from "../../lib/shop-api";
import { FONT, COLORS } from "../../lib/theme";
import { Badge, Chip, FieldLabel, Money, PrimaryButton, SecondaryButton } from "../../components/ui";
import { AppHead } from "../../components/AppHead";
import { Icon, type IconName } from "../../components/Icon";
import { GoProSheet } from "../../components/GoProSheet";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { useTabScrollToTop } from "../../lib/tab-scroll";
import { REFRESH_TINT } from "../../lib/refresh";
import { EnterView } from "../../lib/motion";
import { useHomeViewModel } from "../../hooks/useHomeViewModel";

/**
 * Home — the business snapshot you open every morning, not a feed.
 *
 * All data logic lives in useHomeViewModel. This component is pure presentation.
 */

/** Home's cards: one radius, one interior, everywhere. */
const CARD = { borderRadius: 14, padding: 18 } as const;

/** One figure in the three-up row. */
function Stat({ caption, value, negative }: { caption: string; value: string; negative?: boolean }) {
  return (
    <View className="min-w-0 flex-1" accessible accessibilityLabel={`${caption}: ${value}`}>
      <Text
        style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"], lineHeight: 22 }}
        className={`text-[17px] ${negative ? "text-danger" : "text-ink"}`}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className="mt-0.5 text-[12px] text-inkfaint" numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

/** Quick-action tile — 44px+ target, icon over label, three to a row. */
function QuickAction({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      className="min-h-[76px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-hairline bg-surface2 px-2 py-3.5 active:scale-[0.97]"
    >
      <Icon name={icon} size={18} color={COLORS.acid} />
      <Text style={{ fontFamily: FONT.medium, lineHeight: 16 }} className="text-center text-[12px] text-inkdim" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [proSheet, setProSheet] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const vm = useHomeViewModel();

  useTabScrollToTop("index", useCallback(() => {
    if (!scrollRef.current) return false;
    scrollRef.current.scrollTo({ y: 0, animated: true });
    return true;
  }, []));

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
      <View className="px-5">
        <AppHead title="Latag" onSettings={() => router.push("/settings")} />
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={vm.refreshing} onRefresh={vm.refresh} {...REFRESH_TINT} />}
      >
        {/* --- Snapshot ------------------------------------------------- */}
        <View className="mt-1 border border-hairline bg-surface1" style={CARD}>
          <View accessible accessibilityLabel={`Stock value: ${formatPeso(vm.snap.stockValue)}`}>
            <Text
              style={{ fontFamily: FONT.semibold, letterSpacing: 0.92, lineHeight: 16 }}
              className="text-[11.5px] uppercase text-inkfaint"
            >
              Stock value
            </Text>
            <View className="mt-1.5">
              <Money value={vm.snap.stockValue} size="hero" />
            </View>
          </View>
          <View className="mt-4 flex-row gap-3 border-t border-hairline pt-3.5">
            <Stat caption="Items available" value={String(vm.snap.itemsAvailable)} />
            <Stat caption="Sold this week" value={String(vm.snap.soldThisWeek)} />
            <Stat caption="Profit this month" value={formatPeso(vm.snap.profitThisMonth)} negative={vm.snap.profitThisMonth < 0} />
          </View>
        </View>

        {/* --- Next bale run ------------------------------------------- */}
        {vm.next ? (
          <>
            <FieldLabel>Next bale run</FieldLabel>
            <View className="border border-hairline bg-surface1" style={CARD}>
              <View className="flex-row items-center gap-3">
                <Text style={{ fontFamily: FONT.semibold }} className="min-w-0 flex-1 text-[17px] text-ink" numberOfLines={1}>
                  {vm.next.name}
                </Text>
                <Text style={{ fontFamily: FONT.display, fontVariant: ["tabular-nums"] }} className="text-[15px] text-acid">
                  {formatCountdown(vm.next.scheduledAt!, new Date())}
                </Text>
              </View>
              <View className="mt-1 flex-row items-center gap-1">
                <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="text-[12px] text-inkfaint">
                  {formatScheduleStamp(vm.next.scheduledAt!)}
                </Text>
                {vm.next.locationName ? (
                  <>
                    <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="text-[12px] text-inkfaint"> · </Text>
                    <Icon name="MapPin" size={11} color={COLORS.inkFaint} />
                    <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="min-w-0 shrink text-[12px] text-inkfaint" numberOfLines={1}>
                      {vm.next.locationName}
                    </Text>
                  </>
                ) : null}
              </View>
              <View className="mt-4 flex-row justify-end">
                <Chip label="Start now" selected onPress={() => vm.startNow(vm.next!)} />
              </View>
            </View>
          </>
        ) : null}

        {/* --- Shop status ---------------------------------------------- */}
        {!vm.pro ? (
          <>
            <FieldLabel>Shop</FieldLabel>
            <View className="border border-hairline bg-surface1" style={CARD}>
              <View className="h-11 w-11 items-center justify-center rounded-[12px] bg-surface2">
                <Icon name="Storefront" size={22} color={COLORS.acid} />
              </View>
              <Text style={{ fontFamily: FONT.display }} className="mt-3.5 text-[18px] text-ink">Your own shop page</Text>
              <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="mt-2 text-[13px] text-inkdim">
                Publish items to a public page buyers can browse — share one link on FB, IG, or Messenger.
              </Text>
              <PrimaryButton label="Unlock with Pro" onPress={() => setProSheet(true)} />
            </View>
          </>
        ) : vm.profile === null ? (
          <>
            <FieldLabel>Shop</FieldLabel>
            <View className="border border-hairline bg-surface1" style={CARD}>
              <Text style={{ fontFamily: FONT.display }} className="text-[18px] text-ink">Your own shop page</Text>
              <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="mt-2 text-[13px] text-inkdim">
                Publish items to a public page buyers can browse — share one link on FB, IG, or Messenger.
              </Text>
              <PrimaryButton label="Set up my shop" icon="Storefront" onPress={() => router.push("/shop/setup")} />
            </View>
          </>
        ) : vm.profile ? (
          <>
            <FieldLabel>Shop</FieldLabel>
            <View className="border border-hairline bg-surface1" style={CARD}>
              <View className="flex-row items-center gap-3">
                <Text style={{ fontFamily: FONT.display }} className="min-w-0 flex-1 text-[18px] text-ink" numberOfLines={1}>
                  {vm.profile.displayName}
                </Text>
                <Badge label={vm.profile.isPublished ? "LIVE" : "OFF"} tone={vm.profile.isPublished ? "default" : "sold"} />
              </View>
              {vm.profile.isPublished ? (
                <Text selectable style={{ fontFamily: FONT.semibold, lineHeight: 19 }} className="mt-1.5 text-[13px] text-acid" numberOfLines={1}>
                  {shopUrlLabel(vm.profile.handle)}
                </Text>
              ) : (
                <Text style={{ fontFamily: FONT.semibold, lineHeight: 19 }} className="mt-1.5 text-[13px] text-danger">
                  Your shop is switched off
                </Text>
              )}
              <Text
                style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 17 }}
                className="mt-2.5 text-[12px] text-inkfaint"
              >
                {`${vm.published.length} published`}
              </Text>
              {vm.pending > 0 ? (
                <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className="mt-1 text-[11.5px] text-inkfaint">
                  {pendingLabel(vm.pending)}
                </Text>
              ) : null}
              {vm.profile.isPublished ? (
                <View className="mt-4 flex-row">
                  <SecondaryButton label="Copy link" icon="ClipboardText" onPress={() => void vm.copyLink()} />
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* --- Recent items --------------------------------------------- */}
        {vm.recent.length > 0 ? (
          <>
            <FieldLabel>Recent items</FieldLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: 10, paddingRight: 4 }}
            >
              {vm.recent.map((item: Item, index: number) => {
                const uri = vm.thumbs.get(item.id) ?? null;
                return (
                  <EnterView key={item.id} index={index}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item.brand}
                      onPress={() => router.push(`/item/${item.id}`)}
                      className={`h-16 w-16 items-center justify-center rounded-[10px] border border-hairline bg-surface2 ${item.status === "sold" ? "opacity-45" : ""}`}
                    >
                      {uri ? (
                        <Image source={{ uri }} recyclingKey={uri} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
                      ) : (
                        <Text style={{ fontFamily: FONT.bold }} className="text-[20px] text-inkfaint">{item.brand[0]}</Text>
                      )}
                    </Pressable>
                  </EnterView>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {/* --- Quick actions -------------------------------------------- */}
        <FieldLabel>Quick actions</FieldLabel>
        <View className="flex-row gap-2.5">
          <QuickAction label="New batch" icon="Plus" onPress={() => router.push("/session/new")} />
          <QuickAction
            label="Export a drop"
            icon="Download"
            onPress={() => router.push(vm.latestBatch ? `/session/${vm.latestBatch.id}/export` : "/session/new")}
          />
          <QuickAction label="Open shop" icon="Storefront" onPress={() => router.push("/shop")} />
        </View>
      </ScrollView>

      <GoProSheet visible={proSheet} onClose={() => setProSheet(false)} />
    </View>
  );
}
