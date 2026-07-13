import { Pressable, Text } from "react-native";
import { Image } from "expo-image";
import { FONT } from "../lib/theme";

export function PhotoSlot({ label, uri, onPress }: { label: string; uri: string | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`aspect-square flex-1 items-center justify-center gap-1.5 rounded-[10px] border ${uri ? "border-hairline" : "border-dashed border-hairline"}`}>
      {uri ? <Image source={{ uri }} recyclingKey={uri} style={{ position: "absolute", inset: 0, borderRadius: 10 }} contentFit="cover" /> : null}
      <Text style={{ fontFamily: FONT.display }} className={`text-[10px] ${uri ? "text-inkdim" : "text-inkfaint"}`}>{label}</Text>
    </Pressable>
  );
}
