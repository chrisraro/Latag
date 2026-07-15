import { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { items } from "../../../db/schema";
import { markSold } from "../../../lib/repo";
import { FONT } from "../../../lib/theme";
import { formatPeso } from "../../../lib/format";
import { showSuccess } from "../../../lib/toast";
import { FieldLabel, PrimaryButton } from "../../../components/ui";
import { Wheel, rangeValues } from "../../../components/Wheel";

export default function MarkSoldScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const item = db.select().from(items).where(eq(items.id, id)).all()[0];
  const [price, setPrice] = useState(item?.targetSellPrice ?? 0);
  const [confirming, setConfirming] = useState(false); // double-tap guard
  if (!item) return null;
  const values = rangeValues(Math.max(10, item.targetSellPrice - 500), item.targetSellPrice + 500, 10);

  const confirm = () => {
    if (confirming) return;
    setConfirming(true);
    markSold(db, id, price);
    showSuccess(`Sold for ${formatPeso(price)}`);
    router.back();
  };

  return (
    <View className="flex-1 bg-surface1 px-5" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}>
      <View className="mb-3 h-1 w-11 self-center rounded-full bg-[#3A3A3A]" />
      <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">Mark Sold</Text>
      <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="mb-3 mt-0.5 text-[12.5px] text-inkfaint">
        Listed at {formatPeso(item.targetSellPrice)} — set the final price if you haggled.
      </Text>
      <FieldLabel>Sold for</FieldLabel>
      <Wheel values={values} value={price} onChange={setPrice} unit="₱" format={(v) => v.toLocaleString("en-PH")} allowCustom />
      <PrimaryButton label="Confirm Sale" icon="Check" onPress={confirm} disabled={confirming} />
      <Text style={{ fontFamily: FONT.text }} className="text-center text-[11.5px] text-inkfaint">Records price + date. Undo anytime from the item.</Text>
    </View>
  );
}
