import { useCallback, useRef, useState } from "react";
import { Share } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, isNotNull } from "drizzle-orm";
import * as Clipboard from "expo-clipboard";
import { db } from "../db/client";
import { entitlements, items, photos, publishQueue, type Item } from "../db/schema";
import { cacheShop, cachedShop, getMyShop, shopUrl, shopUrlLabel, type ShopProfile } from "../lib/shop-api";
import { MAX_ATTEMPTS, kickSync } from "../lib/shop-sync";
import { showSuccess } from "../lib/toast";
import { useRefresh, settle } from "../lib/refresh";

/**
 * Shop view-model — owns all data queries, derived state, and actions.
 *
 * The screen component should only read from this hook and call its actions.
 * No direct db access, no business logic in the component.
 */

type Profile = ShopProfile | null | undefined;

export type Listing = Item & { frontPhoto: string | null };

export type ShopViewModel = {
  // --- Derived state ---
  pro: boolean;
  queued: number;
  /** Queue rows still within their retry budget — the count it is honest to
   *  tell the seller "syncs when you're online". Excludes `stuck` rows, which
   *  have exhausted their retries and will never drain on their own. */
  pending: number;
  /** Queue rows that have exhausted MAX_ATTEMPTS — a publish that has stopped
   *  retrying, not merely one still waiting its turn. Surfaced separately from
   *  `pending` so a permanently-failed change is never mistaken for "in progress". */
  stuck: number;
  profile: Profile;
  stale: boolean;
  failed: boolean;
  loading: boolean;
  listings: Listing[];
  /** Drives `RefreshControl`'s `refreshing` — true only while a pull is in flight. */
  refreshing: boolean;

  // --- Actions ---
  copyLink: () => Promise<void>;
  shareLink: () => Promise<void>;
  refresh: () => Promise<void> | void;
};

export function useShopViewModel(): ShopViewModel {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(undefined);
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reread, setReread] = useState(0);

  // --- Data queries ---
  const { data: entRows } = useLiveQuery(db.select().from(entitlements), [reread]);
  const { data: publishedRows } = useLiveQuery(
    db.select().from(items).where(isNotNull(items.publishedAt)).orderBy(desc(items.publishedAt)),
    [reread],
  );
  const { data: photoRows } = useLiveQuery(db.select().from(photos), [reread]);
  const { data: queueRows } = useLiveQuery(db.select().from(publishQueue), [reread]);

  // --- Derived state ---
  const pro = entRows?.[0]?.pro === true;
  const queue = queueRows ?? [];
  const queued = queue.length;
  const pending = queue.filter((q) => q.attempts < MAX_ATTEMPTS).length;
  const stuck = queue.filter((q) => q.attempts >= MAX_ATTEMPTS).length;

  const listings: Listing[] = (publishedRows ?? []).map((item) => {
    const front = (photoRows ?? []).find((p) => p.itemId === item.id && p.type === "front");
    return { ...item, frontPhoto: front?.localUri ?? null };
  });

  // --- Shop profile ---
  const load = useCallback(async () => {
    setLoading(true);
    const res = await getMyShop();
    if (res.ok) {
      setProfile(res.data);
      setStale(false);
      setFailed(false);
      void cacheShop(res.data);
    } else {
      const cached = await cachedShop();
      setStale(true);
      setProfile((prev) => prev ?? cached);
      setFailed(cached == null);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { if (pro) void load(); }, [pro, load]));

  // --- Actions ---
  const refresh = useCallback(async () => {
    setReread((n) => n + 1);
    if (queued > 0) kickSync(db);
    await Promise.all([pro ? load() : Promise.resolve(), settle()]);
  }, [pro, load, queued]);

  const copyLink = useCallback(async () => {
    if (!profile) return;
    try {
      await Clipboard.setStringAsync(shopUrl(profile.handle));
      showSuccess("Link copied");
    } catch {
      showSuccess("Couldn't copy — your link is " + shopUrlLabel(profile.handle));
    }
  }, [profile]);

  const shareLink = useCallback(async () => {
    if (!profile) return;
    try {
      await Share.share({ message: shopUrl(profile.handle) });
    } catch {
      // User cancelled or share failed
    }
  }, [profile]);

  const { refreshing, onRefresh } = useRefresh(refresh);

  return {
    pro,
    queued,
    pending,
    stuck,
    profile,
    stale,
    failed,
    loading,
    listings,
    refreshing,
    copyLink,
    shareLink,
    refresh: onRefresh,
  };
}
