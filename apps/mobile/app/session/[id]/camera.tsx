import { useMemo, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { persistPhoto } from "../../../lib/media";
import { stagePhoto, type SlotType } from "../../../lib/photo-staging";
import { FONT, COLORS } from "../../../lib/theme";
import { PrimaryButton } from "../../../components/ui";
import { Icon } from "../../../components/Icon";

const SLOTS: SlotType[] = ["front", "back", "tag", "flaw"];
const SLOT_LABEL: Record<SlotType, string> = { front: "Front", back: "Back", tag: "Tag", flaw: "Flaw" };

/** Mockup .vf corner bracket: 26×26, 3px acid border on two adjacent edges, 6px outer-corner radius. */
function Corner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const base = { position: "absolute" as const, width: 26, height: 26, borderColor: COLORS.acid };
  const byPos = {
    tl: { top: 18, left: 18, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
    tr: { top: 18, right: 18, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
    bl: { bottom: 18, left: 18, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
    br: { bottom: 18, right: 18, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  } as const;
  return <View pointerEvents="none" style={{ ...base, ...byPos[position] }} />;
}

export default function CameraScreen() {
  const { slot, filled } = useLocalSearchParams<{ slot: SlotType; filled?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cam = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const activeSlot: SlotType = slot ?? "front";
  const filledSlots = useMemo(() => new Set((filled ?? "").split(",").filter(Boolean)), [filled]);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-6" style={{ paddingBottom: insets.bottom }}>
        <Text style={{ fontFamily: FONT.display }} className="text-[18px] text-ink">Camera access needed</Text>
        <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="mt-2 text-center text-[13px] text-inkdim">Photos are compressed and stored on your phone only — never uploaded.</Text>
        <View className="mt-4 w-full"><PrimaryButton label="Allow Camera" onPress={requestPermission} /></View>
        <Pressable onPress={() => router.back()} className="h-11 items-center justify-center px-4"><Text style={{ lineHeight: 18 }} className="text-[13px] text-inkfaint">Not now</Text></Pressable>
      </View>
    );
  }

  const capture = async () => {
    try {
      const photo = await cam.current?.takePictureAsync();
      if (!photo) return;
      const uri = await persistPhoto(photo.uri);          // compress → move → file:// URI (file exists before any row)
      stagePhoto(activeSlot, uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); // stay on camera, no crash
    }
  };

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom }}>
      <View className="flex-row items-center gap-3 pb-2.5 pt-3">
        <Pressable hitSlop={6} onPress={() => router.back()} className="h-10 w-10 flex-none items-center justify-center rounded-full bg-surface2">
          <Icon name="X" size={18} color={COLORS.inkDim} />
        </Pressable>
        <Text numberOfLines={1} style={{ fontFamily: FONT.display }} className="min-w-0 flex-1 text-[17px] text-ink">{SLOT_LABEL[activeSlot]} photo</Text>
      </View>
      <CameraView ref={cam} style={{ flex: 1, marginTop: 8, borderRadius: 16, overflow: "hidden" }}>
        <Corner position="tl" />
        <Corner position="tr" />
        <Corner position="bl" />
        <Corner position="br" />
        <Text
          style={{ position: "absolute", left: 0, right: 0, bottom: 16, textAlign: "center", fontFamily: FONT.semibold, fontSize: 11, letterSpacing: 0.88 }}
          className="text-inkfaint"
        >
          FILL THE FRAME — AUTO-COMPRESSES TO 1200PX
        </Text>
      </CameraView>
      <View className="mt-3.5 flex-row justify-center gap-2">
        {SLOTS.map((s) => {
          const isCurrent = s === activeSlot;
          const isDone = !isCurrent && filledSlots.has(s);
          return (
            <View
              key={s}
              className={`flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${isDone ? "border-acid" : isCurrent ? "border-ink" : "border-hairline"}`}
            >
              {isDone ? <Icon name="Check" size={12} color={COLORS.acid} /> : null}
              <Text
                style={{ fontFamily: FONT.display, letterSpacing: 0.44, lineHeight: 15 }}
                className={`text-[11px] ${isDone ? "text-acid" : isCurrent ? "text-ink" : "text-inkfaint"}`}
              >{s.toUpperCase()}</Text>
            </View>
          );
        })}
      </View>
      <Pressable onPress={capture} className="my-4 h-[74px] w-[74px] self-center rounded-full border-4 border-ink bg-surface2 p-1.5">
        <View className="flex-1 rounded-full bg-acid" />
      </Pressable>
    </View>
  );
}
