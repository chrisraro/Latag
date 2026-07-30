import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, isNotNull, isNull } from "drizzle-orm";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { db } from "../db/client";
import { entitlements, items, photos, publishQueue, sessions, type Item, type Session } from "../db/schema";
import { nextScheduled, recentItems, snapshot } from "../lib/overview";
import { MAX_ATTEMPTS, kickSync, pendingLabel } from "../lib/shop-sync";
import { cacheShop, cachedShop, getMyShop, shopUrl, shopUrlLabel, type ShopProfile } from "../lib/shop-api";
import { startScheduledSession } from "../lib/repo";
import { cancelReminders } from "../lib/notifications";
import { showSuccess } from "../lib/toast";
import { useRefresh, settle } from "../lib/refresh";

/**
 * Home view-model — owns all data queries, derived state, and actions.
 *
 * The screen component should only read from this hook and call its actions.
 * No direct db access, no business logic in the component.
 */

type Profile = ShopProfile | null | undefined;

export type HomeViewModel = {
  // --- Derived state ---
  snap: ReturnType<typeof snapshot>;
  recent: Item[];
  next: Session | null;
  thumbs: Map<string, string>;
  pro: boolean;
  published: Item[];
  queued: number;
  pending: number;
  latestBatch: Session | undefined;
  profile: Profile;
  /** Drives `RefreshControl`'s `refreshing` — true only while a pull is in flight. */
  refreshing: boolean;

  // --- Actions ---
  startNow: (s: Session) => void;
  copyLink: () => Promise<void>;
  refresh: () => Promise<void> | void;
  reread: number;
};

export function useHomeViewModel(): HomeViewModel {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(undefined);
  const startGuard = useRef(false);
  const [now, setNow] = useState(() => new Date());
  const [reread, setReread] = useState(0);

  // --- Data queries ---
  const { data: itemRows } = useLiveQuery(db.select().from(items).orderBy(desc(items.createdAt)), [reread]);
  const { data: photoRows } = useLiveQuery(db.select().from(photos), [reread]);
  const { data: scheduledRows } = useLiveQuery(db.select().from(sessions).where(isNotNull(sessions.scheduledAt)), [reread]);
  const { data: liveSessionRows } = useLiveQuery(
    db.select().from(sessions).where(isNull(sessions.scheduledAt)).orderBy(desc(sessions.createdAt)),
    [reread],
  );
  const { data: entRows } = useLiveQuery(db.select().from(entitlements), [reread]);
  const { data: queueRows } = useLiveQuery(db.select().from(publishQueue), [reread]);

  // --- Derived state ---
  const all = useMemo(() => itemRows ?? [], [itemRows]);
  const snap = useMemo(() => snapshot(all, now), [all, now]);
  const recent = useMemo(() => recentItems(all, 8), [all]);
  const next = useMemo(() => nextScheduled(scheduledRows ?? [], now), [scheduledRows, now]);
  const thumbs = useMemo(
    () => new Map((photoRows ?? []).filter((p) => p.type === "front").map((p) => [p.itemId, p.localUri])),
    [photoRows],
  );

  const pro = entRows?.[0]?.pro === true;
  const published = useMemo(() => all.filter((i) => i.publishedAt !== null), [all]);
  const queue = queueRows ?? [];
  const queued = queue.length;
  const pending = queue.filter((q) => q.attempts < MAX_ATTEMPTS).length;
  const latestBatch: Session | undefined = liveSessionRows?.[0];

  // --- Countdown clock ---
  const hasScheduled = (scheduledRows?.length ?? 0) > 0;
  useEffect(() => {
    if (!hasScheduled) return;
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [hasScheduled]);

  useEffect(() => {
    if (!hasScheduled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(new Date());
    });
    return () => sub.remove();
  }, [hasScheduled]);

  // Reset start guard when scheduled rows change (conversion happened)
  useEffect(() => { startGuard.current = false; }, [scheduledRows]);

  // --- Shop profile ---
  const loadShop = useCallback(async () => {
    const res = await getMyShop();
    if (res.ok) {
      setProfile(res.data);
      void cacheShop(res.data);
      return;
    }
    const cached = await cachedShop();
    setProfile((prev) => prev ?? cached);
  }, []);

  useFocusEffect(useCallback(() => { if (pro) void loadShop(); }, [pro, loadShop]));

  // --- Actions ---
  const refresh = useCallback(async () => {
    setReread((n) => n + 1);
    setNow(new Date());
    if (queued > 0) kickSync(db);
    await Promise.all([pro ? loadShop() : Promise.resolve(), settle()]);
  }, [pro, loadShop, queued]);

  const startNow = useCallback((s: Session) => {
    if (startGuard.current) return;
    startGuard.current = true;
    const { notificationIds } = startScheduledSession(db, s.id);
    cancelReminders(notificationIds).catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSuccess("Batch started");
    router.push(`/session/${s.id}`);
  }, [router]);

  const copyLink = useCallback(async () => {
    if (!profile) return;
    try {
      await Clipboard.setStringAsync(shopUrl(profile.handle));
      showSuccess("Link copied");
    } catch {
      showSuccess("Couldn't copy — your link is " + shopUrlLabel(profile.handle));
    }
  }, [profile]);

  const { refreshing, onRefresh } = useRefresh(refresh);

  return {
    snap,
    recent,
    next,
    thumbs,
    pro,
    published,
    queued,
    pending,
    latestBatch,
    profile,
    refreshing,
    startNow,
    copyLink,
    refresh: onRefresh,
    reread,
  };
}
