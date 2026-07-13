import { useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { persistPhoto } from "../../../lib/media";
import { stagePhoto, type SlotType } from "../../../lib/photo-staging";
import { FONT } from "../../../lib/theme";
import { PrimaryButton } from "../../../components/ui";

export default function CameraScreen() {
  const { slot } = useLocalSearchParams<{ slot: SlotType }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cam = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-6" style={{ paddingBottom: insets.bottom }}>
        <Text style={{ fontFamily: FONT.display }} className="text-[18px] text-ink">Camera access needed</Text>
        <Text style={{ fontFamily: FONT.text }} className="mt-2 text-center text-[13px] text-inkdim">Photos are compressed and stored on your phone only — never uploaded.</Text>
        <View className="mt-4 w-full"><PrimaryButton label="Allow Camera" onPress={requestPermission} /></View>
        <Pressable onPress={() => router.back()}><Text className="text-[13px] text-inkfaint">Not now</Text></Pressable>
      </View>
    );
  }

  const capture = async () => {
    const photo = await cam.current?.takePictureAsync();
    if (!photo) return;
    const uri = await persistPhoto(photo.uri);          // compress → move → file:// URI (file exists before any row)
    stagePhoto(slot ?? "front", uri);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back();
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-row items-center px-4 py-2">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2"><Text className="text-ink">✕</Text></Pressable>
        <Text style={{ fontFamily: FONT.display }} className="ml-3 text-[17px] text-ink">{(slot ?? "front").toUpperCase()} photo</Text>
      </View>
      <CameraView ref={cam} style={{ flex: 1, marginHorizontal: 16, borderRadius: 16, overflow: "hidden" }} />
      <Pressable onPress={capture} className="my-4 h-[74px] w-[74px] self-center rounded-full border-4 border-ink bg-surface2 p-1.5">
        <View className="flex-1 rounded-full bg-acid" />
      </Pressable>
    </View>
  );
}
