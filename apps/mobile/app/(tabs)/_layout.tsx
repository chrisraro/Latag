import { Tabs } from "expo-router";
import { FloatingTabBar } from "../../components/FloatingTabBar";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "#000" } }}
      tabBar={(props) => <FloatingTabBar {...props} />}
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
