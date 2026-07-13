import { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { items } from "../../../db/schema";
import { markSold } from "../../../lib/repo";
import { FONT } from "../../../lib/theme";
import { formatPeso } from "../../../lib/format";
import { FieldLabel, PrimaryButton } from "../../../components/ui";
import { Wheel, rangeValues } from "../../../components/Wheel";

export default function MarkSoldScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const item = db.select().from(items).where(eq(items.id, id)).all()[0];
  const [price, setPrice] = useState(item?.targetSellPrice ?? 0);
  if (!item) return null;
  const values = rangeValues(Math.max(10, item.targetSellPrice - 500), item.targetSellPrice + 500, 10);

  return (
    <View className="flex-1 bg-surface1 px-4 pt-3">
      <View className="mb-3 h-1 w-11 self-center rounded-full bg-hairline" />
      <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">Mark Sold</Text>
      <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="mb-3 mt-0.5 text-[12.5px] text-inkfaint">
        Listed at {formatPeso(item.targetSellPrice)} — set the final price if you haggled.
      </Text>
      <FieldLabel>Sold for</FieldLabel>
      <Wheel values={values} value={price} onChange={setPrice} unit="₱" format={(v) => v.toLocaleString("en-PH")} />
      <PrimaryButton label="Confirm Sale  ✓" onPress={() => { markSold(db, id, price); router.back(); }} />
      <Text style={{ fontFamily: FONT.text }} className="text-center text-[11.5px] text-inkfaint">Records price + date. Undo anytime from the item.</Text>
    </View>
  );
}
