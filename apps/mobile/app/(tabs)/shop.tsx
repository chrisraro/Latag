import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT, COLORS } from "../../lib/theme";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { AppHead } from "../../components/AppHead";
import { Icon } from "../../components/Icon";

/**
 * Shop — honest pre-F2 state. There is nothing to publish yet, so there is no
 * CTA: a button that only apologises is worse than no button.
 */
export default function ShopScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead title="Shop" />
      <View className="flex-1 items-center justify-center" style={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
        <View
          style={{ borderRadius: 12 }}
          className="w-full items-center gap-3 border-[1.5px] border-dashed border-hairline px-6 py-8"
        >
          <Icon name="Storefront" size={26} color={COLORS.inkFaint} />
          <Text style={{ fontFamily: FONT.display }} className="text-center text-[16px] text-ink">
            Your shop isn&apos;t set up yet
          </Text>
          <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="text-center text-[13px] text-inkfaint">
            Publish items from your inventory to a public page buyers can browse — coming in the next update.
          </Text>
        </View>
      </View>
    </View>
  );
}
