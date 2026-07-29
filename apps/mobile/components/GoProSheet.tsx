import { InteractionManager, Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { FONT } from "../lib/theme";
import { PrimaryButton } from "./ui";

/** Pro upsell sheet. Routes to the full paywall screen. */

export function GoProSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();

  const showPaywall = () => {
    onClose();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    InteractionManager.runAfterInteractions(() => router.push("/pro/paywall"));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" className="flex-1 bg-black/60" onPress={onClose} />
      <View className="rounded-t-sheet border-t border-hairline bg-surface1 px-5 pb-7 pt-3">
        <View className="mb-3.5 h-1 w-11 self-center rounded-full bg-hairline" />
        <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">This one needs Latag Pro</Text>
        <Text style={{ fontFamily: FONT.text }} className="mt-1.5 text-[13px] leading-5 text-inkdim">
          Logging your inventory is free and unlimited. Pro unlocks your shop —{" "}
          <Text className="text-acid">₱199/month</Text>, first 14 days free.
          Cancel anytime, no commitment.
        </Text>
        <PrimaryButton label="Start 14-day free trial" onPress={showPaywall} />
        <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className="mt-1 text-center text-[11px] text-inkfaint">
          Already a member? Sign in from Settings to restore
        </Text>
      </View>
    </Modal>
  );
}
