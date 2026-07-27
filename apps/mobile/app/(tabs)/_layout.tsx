import { useCallback } from "react";
import { Tabs, useRouter } from "expo-router";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc } from "drizzle-orm";
import { db } from "../../db/client";
import { sessions } from "../../db/schema";
import { NativeTabBar } from "../../components/NativeTabBar";
import { quickAddRoute } from "../../lib/quick-add";

export default function TabsLayout() {
  const router = useRouter();
  // Most recently created batch, for the toolbar FAB (see lib/quick-add.ts —
  // G2 replaces this lookup once solo items ship).
  const { data: recentSessions } = useLiveQuery(
    db.select({ id: sessions.id }).from(sessions).orderBy(desc(sessions.createdAt)).limit(1),
  );
  const mostRecentBatchId = recentSessions?.[0]?.id ?? null;
  const onQuickAdd = useCallback(() => {
    router.push(quickAddRoute(mostRecentBatchId) as Parameters<typeof router.push>[0]);
  }, [router, mostRecentBatchId]);

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "#000" } }}
      tabBar={(props) => <NativeTabBar {...props} onQuickAdd={onQuickAdd} />}
    >
      {/* `index` is Home (it re-exports `home.tsx`); `home` therefore exists as a
          route too, but the bar's destination allowlist keeps it off the bar. */}
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="inventory" options={{ title: "Inventory" }} />
      <Tabs.Screen name="batches" options={{ title: "Batches" }} />
      <Tabs.Screen name="shop" options={{ title: "Shop" }} />
      {/* Registered so `/settings` keeps resolving (deep links, and the gear in
          every screen's header) — the allowlist keeps it off the bar. */}
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
