import { useCallback } from "react";
import { Tabs, useRouter } from "expo-router";
import { NativeTabBar } from "../../components/NativeTabBar";
import { QUICK_ADD_ROUTE } from "../../lib/quick-add";
import { tabSwitchAnimation, tabTransitionSpec, useReducedMotion } from "../../lib/motion";

export default function TabsLayout() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const onQuickAdd = useCallback(() => {
    router.push(QUICK_ADD_ROUTE as Parameters<typeof router.push>[0]);
  }, [router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "#000" },
        // Tabs are peers, so they cross over rather than slide — a slide would
        // imply an order the bar does not have. Reduced motion cuts straight to
        // the new tab; the tap is never held up by either.
        animation: tabSwitchAnimation(reduced),
        transitionSpec: tabTransitionSpec(reduced),
      }}
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
