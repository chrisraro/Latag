import { View, Text, Pressable, Alert, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { items, photos } from "../../../db/schema";
import { unmarkSold, deleteItem } from "../../../lib/repo";
import { deleteFiles } from "../../../lib/media";
import { FONT } from "../../../lib/theme";
import { formatPeso, formatInches } from "../../../lib/format";
import { Badge, PrimaryButton, SecondaryButton } from "../../../components/ui";

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: itemRows } = useLiveQuery(db.select().from(items).where(eq(items.id, id)), [id]);
  const { data: photoRows } = useLiveQuery(db.select().from(photos).where(eq(photos.itemId, id)), [id]);
  const item = itemRows?.[0];
  if (!item) return null;
  const pics = photoRows ?? [];

  const confirmDelete = () =>
    Alert.alert("Delete item?", "Photos on this item are removed from your phone too.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { const { photoUris } = deleteItem(db, id); deleteFiles(photoUris); router.back(); } },
    ]);

  const Row = ({ k, v, acid }: { k: string; v: string; acid?: boolean }) => (
    <View className="flex-row justify-between border-b border-hairline py-3">
      <Text style={{ fontFamily: FONT.text }} className="text-[15px] text-inkfaint">{k}</Text>
      <Text style={{ fontFamily: FONT.semibold, fontVariant: ["tabular-nums"] }} className={`text-[15px] ${acid ? "text-acid" : "text-ink"}`}>{v}</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2"><Text className="text-[18px] text-inkdim">‹</Text></Pressable>
        <Text style={{ fontFamily: FONT.display }} className="flex-1 text-[20px] text-ink" numberOfLines={1}>{item.brand} {item.category}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} className="rounded-[14px]">
          {(pics.length ? pics : [null]).map((p, idx) => (
            <View key={p?.id ?? idx} className="mr-2 h-72 w-80 items-center justify-center overflow-hidden rounded-[14px] border border-hairline bg-surface2">
              {p ? (<>
                <Image source={{ uri: p.localUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                <View className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-0.5"><Text style={{ fontFamily: FONT.semibold }} className="text-[11px] text-inkdim">{p.type.toUpperCase()}</Text></View>
              </>) : <Text style={{ fontFamily: FONT.bold }} className="text-[48px] text-hairline">{item.brand[0]}</Text>}
            </View>
          ))}
        </ScrollView>
        <View className="mt-2">
          <Row k="Condition" v={item.condition} />
          <Row k="Size" v={`PTP ${formatInches(item.ptpInches)} · L ${formatInches(item.lengthInches)}`} />
          {item.individualCost > 0 ? <Row k="Cost" v={formatPeso(item.individualCost)} /> : null}
          <Row k="Target price" v={formatPeso(item.targetSellPrice)} acid />
          {item.status === "sold" ? <Row k="Sold for" v={formatPeso(item.soldPrice ?? 0)} acid /> : null}
          <View className="flex-row justify-between py-3">
            <Text style={{ fontFamily: FONT.text }} className="text-[15px] text-inkfaint">Status</Text>
            <Badge label={item.status.toUpperCase()} tone={item.status === "sold" ? "sold" : "default"} />
          </View>
        </View>
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        {item.status === "available"
          ? <PrimaryButton label="Mark Sold" onPress={() => router.push(`/item/${id}/sold`)} />
          : <PrimaryButton label="Undo sold" onPress={() => unmarkSold(db, id)} />}
        <View className="mb-2 flex-row gap-2">
          <SecondaryButton label="Edit" onPress={() => router.push(`/session/${item.sessionId}/add?item=${id}`)} />
          <SecondaryButton label="Delete" danger onPress={confirmDelete} />
        </View>
      </View>
    </View>
  );
}
