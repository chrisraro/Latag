import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { db } from "../../db/client";
import { createSession } from "../../lib/repo";
import { FONT } from "../../lib/theme";
import { FieldLabel, PrimaryButton } from "../../components/ui";
import { Wheel, rangeValues } from "../../components/Wheel";

const BALE_VALUES = rangeValues(1000, 50000, 500);

export default function NewSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState<"selector" | "bulto">("selector");
  const [baleCost, setBaleCost] = useState(10000);

  const create = () => {
    if (!name.trim()) return;
    const s = createSession(db, { name: name.trim(), type, location: location.trim() || undefined, totalBaleCost: type === "bulto" ? baleCost : 0 });
    router.replace(`/session/${s.id}`);
  };

  const inputCls = "mb-2.5 h-13 rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink";
  return (
    <View className="flex-1 bg-surface1 px-4" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}>
      <View className="mb-3 h-1 w-11 self-center rounded-full bg-hairline" />
      <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">New Session</Text>
      <Text style={{ fontFamily: FONT.text }} className="mb-3 mt-0.5 text-[12.5px] text-inkfaint">Name it after the spot — you'll thank yourself later.</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Session name" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }} className={inputCls} />
      <TextInput value={location} onChangeText={setLocation} placeholder="Location (optional)" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }} className={inputCls} />
      <FieldLabel>Mode</FieldLabel>
      <View className="flex-row gap-1 rounded-full border border-hairline bg-surface2 p-1">
        {(["selector", "bulto"] as const).map((t) => (
          <Pressable key={t} onPress={() => { Haptics.selectionAsync(); setType(t); }} className={`h-11 flex-1 items-center justify-center rounded-full ${type === t ? "bg-acid" : ""}`}>
            <Text style={{ fontFamily: FONT.display }} className={`text-[13px] uppercase ${type === t ? "text-acidink" : "text-inkdim"}`}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {type === "bulto" ? (<>
        <FieldLabel>Bale cost</FieldLabel>
        <Wheel values={BALE_VALUES} value={baleCost} onChange={setBaleCost} unit="₱" format={(v) => v.toLocaleString("en-PH")} allowCustom />
      </>) : null}
      <PrimaryButton label="Create Session" onPress={create} disabled={!name.trim()} />
    </View>
  );
}
