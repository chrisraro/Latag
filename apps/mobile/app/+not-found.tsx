import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT } from "../lib/theme";
import { PrimaryButton } from "../components/ui";

export default function NotFoundScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 items-center justify-center bg-bg px-5"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}
    >
      <Text style={{ fontFamily: FONT.display }} className="text-[22px] text-ink">Screen not found</Text>
      <Text style={{ fontFamily: FONT.text }} className="mt-2 text-center text-[13.5px] leading-5 text-inkdim">
        That link doesn't lead anywhere in Latag.
      </Text>
      <View className="mt-4 w-full">
        <PrimaryButton label="Back to sessions" onPress={() => router.replace("/")} />
      </View>
    </View>
  );
}
