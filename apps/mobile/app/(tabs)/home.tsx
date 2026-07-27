import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, isNotNull, isNull } from "drizzle-orm";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { db } from "../../db/client";
import { entitlements, items, photos, publishQueue, sessions, type Item, type Session } from "../../db/schema";
import { nextScheduled, recentItems, snapshot } from "../../lib/overview";
import { formatPeso } from "../../lib/format";
import { formatCountdown, formatScheduleStamp } from "../../lib/schedule";
import { MAX_ATTEMPTS, pendingLabel } from "../../lib/shop-sync";
import { cacheShop, cachedShop, getMyShop, shopUrl, shopUrlLabel, type ShopProfile } from "../../lib/shop-api";
import { startScheduledSession } from "../../lib/repo";
import { cancelReminders } from "../../lib/notifications";
import { showSuccess } from "../../lib/toast";
import { FONT, COLORS } from "../../lib/theme";
import { Badge, Chip, FieldLabel, Money, PrimaryButton, SecondaryButton } from "../../components/ui";
import { AppHead } from "../../components/AppHead";
import { Icon, type IconName } from "../../components/Icon";
import { GoProSheet } from "../../components/GoProSheet";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { useTabScrollToTop } from "../../lib/tab-scroll";

/**
 * Home — the business snapshot you open every morning, not a feed.
 *
 * Every figure is derived from the same local queries the other tabs already
 * run (lib/overview does the arithmetic, purely), so nothing here needs a
 * network, a new table, or a spinner. Sections that have nothing to say render
 * nothing at all: no scheduled run means no "next run" block, an empty
 * inventory means no recent strip.
 *
 * The first-run gate deliberately lives in app/_layout.tsx (since F1) — it must
 * never be re-introduced here, or the tab bar flashes before the redirect lands.
 */

/** Home's cards: one radius, one interior, everywhere. */
const CARD = { borderRadius: 14, padding: 18 } as const;

/** undefined = still reading; null = definitively no shop. */
type Profile = ShopProfile | null | undefined;

/** One figure in the three-up row. The a11y label carries value + caption
 *  together so a screen reader never reads a bare number. */
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
  const [profile, setProfile] = useState<Profile>(undefined);
  const scrollRef = useRef<ScrollView>(null);
  const startGuard = useRef(false); // double-tap guard for Start now
  // Countdown clock: re-render every 30s while something is scheduled, so
  // "in 45m" stays honest without any data change.
  const [now, setNow] = useState(() => new Date());

  useTabScrollToTop("index", useCallback(() => {
    if (!scrollRef.current) return false;
    scrollRef.current.scrollTo({ y: 0, animated: true });
    return true;
  }, []));

  const { data: itemRows } = useLiveQuery(db.select().from(items).orderBy(desc(items.createdAt)), []);
  const { data: photoRows } = useLiveQuery(db.select().from(photos), []);
  const { data: scheduledRows } = useLiveQuery(db.select().from(sessions).where(isNotNull(sessions.scheduledAt)), []);
  const { data: liveSessionRows } = useLiveQuery(
    db.select().from(sessions).where(isNull(sessions.scheduledAt)).orderBy(desc(sessions.createdAt)),
    [],
  );
  const { data: entRows } = useLiveQuery(db.select().from(entitlements), []);
  const { data: queueRows } = useLiveQuery(db.select().from(publishQueue), []);

  const all = useMemo(() => itemRows ?? [], [itemRows]);
  const snap = useMemo(() => snapshot(all, now), [all, now]);
  const recent = useMemo(() => recentItems(all, 8), [all]);
  const next = useMemo(() => nextScheduled(scheduledRows ?? [], now), [scheduledRows, now]);
  const thumbs = useMemo(
    () => new Map((photoRows ?? []).filter((p) => p.type === "front").map((p) => [p.itemId, p.localUri])),
    [photoRows],
  );

  const pro = entRows?.[0]?.pro === true;
  const published = all.filter((i) => i.publishedAt !== null);
  const queue = queueRows ?? [];
  const pending = queue.filter((q) => q.attempts < MAX_ATTEMPTS).length;
  const latestBatch: Session | undefined = liveSessionRows?.[0];

  const hasScheduled = (scheduledRows?.length ?? 0) > 0;
  useEffect(() => {
    if (!hasScheduled) return;
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [hasScheduled]);

  // The interval above is suspended while the app is backgrounded, so a resumed
  // screen would keep rendering the countdown it minted before the phone slept.
  useEffect(() => {
    if (!hasScheduled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(new Date());
    });
    return () => sub.remove();
  }, [hasScheduled]);

  // Releases once the live query reflects the conversion — no timer to leak.
  useEffect(() => { startGuard.current = false; }, [scheduledRows]);

  const loadShop = useCallback(async () => {
    const res = await getMyShop();
    if (res.ok) {
      setProfile(res.data);
      void cacheShop(res.data);
      return;
    }
    // Offline or signed out: the last shop we saw beats an empty card. Home
    // never offers a retry — the Shop tab owns that conversation.
    const cached = await cachedShop();
    setProfile((prev) => prev ?? cached);
  }, []);

  // Refetch on focus so a save in /shop/setup shows here the moment it closes.
  useFocusEffect(useCallback(() => { if (pro) void loadShop(); }, [pro, loadShop]));

  const startNow = (s: Session) => {
    if (startGuard.current) return;
    startGuard.current = true;
    const { notificationIds } = startScheduledSession(db, s.id);
    cancelReminders(notificationIds).catch(() => {}); // best-effort; ids may have fired already
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSuccess("Batch started");
    router.push(`/session/${s.id}`);
  };

  const copyLink = async () => {
    if (!profile) return;
    try {
      await Clipboard.setStringAsync(shopUrl(profile.handle));
      showSuccess("Link copied");
    } catch {
      showSuccess("Couldn't copy — your link is " + shopUrlLabel(profile.handle));
    }
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
      <View className="px-5">
        <AppHead
          title="Latag"
          right={
            <Pressable
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push("/settings")}
              className="h-10 w-10 flex-none items-center justify-center rounded-full bg-surface2"
            >
              <Icon name="GearSix" size={16} color={COLORS.inkDim} />
            </Pressable>
          }
        />
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >
        {/* --- Snapshot ------------------------------------------------- */}
        <View className="mt-1 border border-hairline bg-surface1" style={CARD}>
          <View accessible accessibilityLabel={`Stock value: ${formatPeso(snap.stockValue)}`}>
            <Text
              style={{ fontFamily: FONT.semibold, letterSpacing: 0.92, lineHeight: 16 }}
              className="text-[11.5px] uppercase text-inkfaint"
            >
              Stock value
            </Text>
            <View className="mt-1.5">
              <Money value={snap.stockValue} size="hero" />
            </View>
          </View>
          <View className="mt-4 flex-row gap-3 border-t border-hairline pt-3.5">
            <Stat caption="Items available" value={String(snap.itemsAvailable)} />
            <Stat caption="Sold this week" value={String(snap.soldThisWeek)} />
            <Stat caption="Profit this month" value={formatPeso(snap.profitThisMonth)} negative={snap.profitThisMonth < 0} />
          </View>
        </View>

        {/* --- Next bale run (nothing scheduled → nothing at all) -------- */}
        {next ? (
          <>
            <FieldLabel>Next bale run</FieldLabel>
            <View className="border border-hairline bg-surface1" style={CARD}>
              <View className="flex-row items-center gap-3">
                <Text style={{ fontFamily: FONT.semibold }} className="min-w-0 flex-1 text-[17px] text-ink" numberOfLines={1}>
                  {next.name}
                </Text>
                <Text style={{ fontFamily: FONT.display, fontVariant: ["tabular-nums"] }} className="text-[15px] text-acid">
                  {formatCountdown(next.scheduledAt!, now)}
                </Text>
              </View>
              <View className="mt-1 flex-row items-center gap-1">
                <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="text-[12px] text-inkfaint">
                  {formatScheduleStamp(next.scheduledAt!)}
                </Text>
                {next.locationName ? (
                  <>
                    <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="text-[12px] text-inkfaint"> · </Text>
                    <Icon name="MapPin" size={11} color={COLORS.inkFaint} />
                    <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="min-w-0 shrink text-[12px] text-inkfaint" numberOfLines={1}>
                      {next.locationName}
                    </Text>
                  </>
                ) : null}
              </View>
              <View className="mt-4 flex-row justify-end">
                <Chip label="Start now" selected onPress={() => startNow(next)} />
              </View>
            </View>
          </>
        ) : null}

        {/* --- Shop status ---------------------------------------------- */}
        {!pro ? (
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
        ) : profile === null ? (
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
        ) : profile ? (
          <>
            <FieldLabel>Shop</FieldLabel>
            <View className="border border-hairline bg-surface1" style={CARD}>
              <View className="flex-row items-center gap-3">
                <Text style={{ fontFamily: FONT.display }} className="min-w-0 flex-1 text-[18px] text-ink" numberOfLines={1}>
                  {profile.displayName}
                </Text>
                <Badge label={profile.isPublished ? "LIVE" : "OFF"} tone={profile.isPublished ? "default" : "sold"} />
              </View>
              {/* A switched-off shop is a 404 for buyers, so showing the link
                  would be a lie. Say what is true and point at the switch. */}
              {profile.isPublished ? (
                <Text selectable style={{ fontFamily: FONT.semibold, lineHeight: 19 }} className="mt-1.5 text-[13px] text-acid" numberOfLines={1}>
                  {shopUrlLabel(profile.handle)}
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
                {`${published.length} published`}
              </Text>
              {pending > 0 ? (
                <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className="mt-1 text-[11.5px] text-inkfaint">
                  {pendingLabel(pending)}
                </Text>
              ) : null}
              {profile.isPublished ? (
                <View className="mt-4 flex-row">
                  <SecondaryButton label="Copy link" icon="ClipboardText" onPress={() => void copyLink()} />
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* --- Recent items (empty inventory → no strip) ----------------- */}
        {recent.length > 0 ? (
          <>
            <FieldLabel>Recent items</FieldLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: 10, paddingRight: 4 }}
            >
              {recent.map((item: Item) => {
                const uri = thumbs.get(item.id) ?? null;
                return (
                  <Pressable
                    key={item.id}
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
            // Exports belong to a batch; with none logged yet the honest next
            // step is to start one rather than open an export of nothing.
            onPress={() => router.push(latestBatch ? `/session/${latestBatch.id}/export` : "/session/new")}
          />
          <QuickAction label="Open shop" icon="Storefront" onPress={() => router.push("/shop")} />
        </View>
      </ScrollView>

      <GoProSheet visible={proSheet} onClose={() => setProSheet(false)} />
    </View>
  );
}
