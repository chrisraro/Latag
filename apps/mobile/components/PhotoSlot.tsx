import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { FONT, COLORS } from "../lib/theme";
import { Icon } from "./Icon";

/** Mockup .slot: dashed 1.5 hairline, radius 10, gap 6, 11px semibold inkfaint label under an 18px Camera icon at 0.8 opacity. Filled slots swap to a solid hairline border with the photo underneath. */
export function PhotoSlot({ label, uri, onPress }: { label: string; uri: string | null; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderWidth: uri ? 1 : 1.5 }}
      className={`aspect-square flex-1 items-center justify-center gap-1.5 rounded-[10px] ${uri ? "border-hairline" : "border-dashed border-hairline"}`}
    >
      {uri ? (
        <Image source={{ uri }} recyclingKey={uri} style={{ position: "absolute", inset: 0, borderRadius: 10 }} contentFit="cover" />
      ) : (
        <View style={{ opacity: 0.8 }}>
          <Icon name="Camera" size={18} color={COLORS.inkFaint} />
        </View>
      )}
      <Text style={{ fontFamily: FONT.semibold, letterSpacing: 0 }} className={`text-[11px] ${uri ? "text-inkdim" : "text-inkfaint"}`}>{label}</Text>
    </Pressable>
  );
}
