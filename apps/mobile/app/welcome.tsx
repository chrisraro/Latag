import { Image, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../components/Icon";
import { PrimaryButton, SecondaryButton } from "../components/ui";
import { setWelcomed } from "../lib/first-run";
import { COLORS, FONT } from "../lib/theme";

function FeatRow({ icon, label }: { icon: "Target" | "Camera" | "WifiSlash"; label: string }) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <Icon name={icon} size={18} color={COLORS.acid} />
      <Text style={{ fontFamily: FONT.text, lineHeight: 20 }} className="flex-1 text-[14px] text-inkdim">{label}</Text>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const startOffline = async () => {
    await setWelcomed();
    router.replace("/onboarding");
  };

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}>
      <View className="flex-1 justify-center">
        <Image
          source={require("../assets/images/android-icon-foreground.png")}
          style={{ width: 96, height: 96, marginLeft: -14 }}
        />
        <Text
          style={{ fontFamily: FONT.displayBlack, lineHeight: 46 }}
          className="text-[46px] uppercase text-acid"
        >
          Latag
        </Text>
        <Text
          style={{ fontFamily: FONT.text, lineHeight: 22, marginTop: 8, marginBottom: 22, maxWidth: 260 }}
          className="text-[15px] text-inkdim"
        >
          {"Log fast. Know your margins.\nWork where there's no signal."}
        </Text>
        <FeatRow icon="Target" label="Two buying modes — Selector & Bulto" />
        <FeatRow icon="Camera" label="5-second logging, zero typing" />
        <FeatRow icon="WifiSlash" label="100% offline after activation" />
      </View>

      <View>
        <PrimaryButton label="Continue with Email" onPress={() => router.push("/auth/sign-in")} />
        <View className="flex-row">
          <SecondaryButton label="Start offline — sign in later" onPress={() => void startOffline()} />
        </View>
        <Text
          style={{ fontFamily: FONT.text, lineHeight: 16, marginBottom: 8 }}
          className="mt-3 text-center text-[11.5px] text-inkfaint"
        >
          {"Sign-in is only for Pro licensing.\nYour inventory never leaves this phone."}
        </Text>
      </View>
    </View>
  );
}
