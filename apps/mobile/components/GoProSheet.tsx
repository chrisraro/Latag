import { InteractionManager, Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FONT } from "../lib/theme";
import { PrimaryButton, SecondaryButton } from "./ui";

/** Pro upsell sheet. Unmounted since F1 removed the free-tier log cap — kept
 *  intact for F2, which re-mounts it behind the shop-publish gate. */

export function GoProSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();

  const signIn = () => {
    onClose();
    InteractionManager.runAfterInteractions(() => router.push("/auth/sign-in"));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" className="flex-1 bg-black/60" onPress={onClose} />
      <View className="rounded-t-sheet border-t border-hairline bg-surface1 px-5 pb-7 pt-3">
        <View className="mb-3.5 h-1 w-11 self-center rounded-full bg-hairline" />
        <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">This one needs Latag Pro</Text>
        <Text style={{ fontFamily: FONT.text }} className="mt-1.5 text-[13px] leading-5 text-inkdim">
          Logging your inventory is free and unlimited. Pro unlocks your shop — one-time payment, yours forever. Everything else stays offline and on your phone.
        </Text>
        <Text style={{ fontFamily: FONT.semibold, lineHeight: 21 }} className="mt-4 text-[15px] text-acid">Unlock Pro on the website → latag.vercel.app/pro</Text>
        <PrimaryButton label="Got it" onPress={onClose} />
        <View className="flex-row">
          <SecondaryButton label="Already Pro? Sign in" onPress={signIn} />
        </View>
      </View>
    </Modal>
  );
}
