import { InteractionManager, Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FONT } from "../lib/theme";
import { FREE_LOG_LIMIT } from "../lib/entitlements";
import { PrimaryButton, SecondaryButton } from "./ui";

export function GoProSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();

  const signIn = () => {
    onClose();
    InteractionManager.runAfterInteractions(() => router.push("/auth/sign-in"));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />
      <View className="rounded-t-sheet border-t border-hairline bg-surface1 px-5 pb-7 pt-3">
        <View className="mb-3.5 h-1 w-11 self-center rounded-full bg-hairline" />
        <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">You logged all {FREE_LOG_LIMIT} free items</Text>
        <Text style={{ fontFamily: FONT.text }} className="mt-1.5 text-[13px] leading-5 text-inkdim">
          Latag Pro unlocks unlimited logs — one-time payment, yours forever. Everything stays offline and on your phone.
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
