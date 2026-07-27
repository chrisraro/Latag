import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { decideStartRoute } from "../../lib/first-run";
import { FONT } from "../../lib/theme";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { AppHead } from "../../components/AppHead";

/**
 * Inventory — the app's home. Placeholder shell for F1 Task 2; Task 3 fills in
 * search, filters, sort and the item list. The first-run gate below moved here
 * verbatim from the old `app/index.tsx` because this route is now `/`.
 */
export default function InventoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);

  // First-run gate: redirect once if welcome/onboarding is still pending,
  // otherwise render normally. Rendering null until this resolves avoids
  // flashing the inventory list before the redirect lands (splash is already
  // up at mount).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.multiGet(["latag.welcomed", "latag.onboarded"]).then((pairs) => {
      if (cancelled) return;
      const flags = Object.fromEntries(pairs);
      const route = decideStartRoute(flags["latag.welcomed"] !== null, flags["latag.onboarded"] !== null);
      if (route) {
        router.replace(route);
      } else {
        setChecked(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checked) return null;

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead title="Inventory" />
      <View className="flex-1 items-center justify-center" style={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
        <Text style={{ fontFamily: FONT.text, lineHeight: 18 }} className="text-[13px] text-inkfaint">Inventory</Text>
      </View>
    </View>
  );
}
