import { useState } from "react";
import { View, Text, Alert, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { items, photos, sessions } from "../../../db/schema";
import { unmarkSold, deleteItem } from "../../../lib/repo";
import { deleteFiles } from "../../../lib/media";
import { savePhotosToAlbum } from "../../../lib/albums";
import { shareToInstagram } from "../../../lib/ig-share";
import { formatCaption } from "../../../lib/caption";
import { showSuccess, showError } from "../../../lib/toast";
import { FONT } from "../../../lib/theme";
import { formatPeso } from "../../../lib/format";
import { DEPARTMENTS, specRowsFor, type CatalogItem } from "../../../lib/catalog";
import { Badge, PrimaryButton, SecondaryButton } from "../../../components/ui";
import { AppHead } from "../../../components/AppHead";

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: itemRows } = useLiveQuery(db.select().from(items).where(eq(items.id, id)), [id]);
  const { data: photoRows } = useLiveQuery(db.select().from(photos).where(eq(photos.itemId, id)), [id]);
  const item = itemRows?.[0];
  const sessionId = item?.sessionId ?? "";
  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).where(eq(sessions.id, sessionId)), [sessionId]);
  const [carouselW, setCarouselW] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [savingPhotos, setSavingPhotos] = useState(false); // double-tap guard
  if (!item) return null;
  const sessionName = sessionRows?.[0]?.name ?? null;
  const pics = photoRows ?? [];
  const sold = item.status === "sold";
  // Pre-migration rows are department "tops"; unknown values degrade to the Tops label.
  const deptLabel = DEPARTMENTS.find((d) => d.key === item.department)?.label ?? "Tops";

  const confirmDelete = () =>
    Alert.alert("Delete item?", "Photos on this item are removed from your phone too.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { const { photoUris } = deleteItem(db, id); deleteFiles(photoUris).catch(() => {}); showSuccess("Item deleted"); router.back(); } },
    ]);

  const savePhotos = async () => {
    if (savingPhotos) return; // double-tap guard
    setSavingPhotos(true);
    try {
      const res = await savePhotosToAlbum(pics.map((p) => p.localUri), sessionName);
      if (res.ok) showSuccess(`Saved ${res.count} photo(s) to "${res.album}"`);
      else if (res.reason === "permission") showError("Photos permission needed — enable it in system settings");
      else if (res.reason === "empty") showError("No photos to save");
      else showError("Couldn't save photos — try again");
    } finally {
      setSavingPhotos(false);
    }
  };

  const shareIG = async () => {
    if (savingPhotos) return; // shares reuse the save guard — both hit the album
    setSavingPhotos(true);
    try {
      const res = await shareToInstagram({
        uris: pics.map((p) => p.localUri),
        caption: formatCaption([item]),
        sessionName,
      });
      if (res.step === "saved-opened") showSuccess("Photos saved + caption copied — paste it in your IG post");
      else if (res.step === "saved-only") showSuccess("Photos saved + caption copied — open Instagram to post");
      else if (res.step === "permission") showError("Photos permission needed — enable it in system settings");
      else if (res.step === "empty") showError("No photos to save");
      else showError("Couldn't save photos — try again");
    } finally {
      setSavingPhotos(false);
    }
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselW) return;
    setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / carouselW));
  };

  const Row = ({ k, v, acid }: { k: string; v: string; acid?: boolean }) => (
    <View className="flex-row items-baseline justify-between gap-4 border-b border-hairline px-3 py-3.5">
      <Text style={{ fontFamily: FONT.text, lineHeight: 21 }} className="text-[15px] text-inkfaint">{k}</Text>
      <Text style={{ fontFamily: FONT.semibold, fontVariant: ["tabular-nums"], lineHeight: 21 }} className={`min-w-0 shrink text-right text-[15px] ${acid ? "text-acid" : "text-ink"}`}>{v}</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead
        title={item.brand}
        onBack={() => router.back()}
        right={<Badge label={sold ? "SOLD" : item.condition} tone={sold ? "sold" : "default"} />}
      />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View
          onLayout={(e) => setCarouselW(e.nativeEvent.layout.width)}
          className={`overflow-hidden rounded-[14px] border border-hairline bg-surface2 ${sold ? "opacity-50" : ""}`}
          style={{ aspectRatio: 4 / 3.5 }}
        >
          {carouselW > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onScrollEnd}
            >
              {(pics.length ? pics : [null]).map((p, idx) => (
                <View key={p?.id ?? idx} style={{ width: carouselW }} className="items-center justify-center">
                  {p ? (
                    <Image source={{ uri: p.localUri }} recyclingKey={p.localUri} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  ) : (
                    <Text style={{ fontFamily: FONT.bold }} className="text-[64px] text-hairline">{item.brand[0]}</Text>
                  )}
                  {p ? (
                    <View style={{ backgroundColor: "rgba(0,0,0,0.72)" }} className="absolute left-3 top-3 rounded-[6px] px-2.5 py-1">
                      <Text style={{ fontFamily: FONT.semibold, lineHeight: 15 }} className="text-[11px] text-inkdim">{p.type.toUpperCase()} · {idx + 1}/{pics.length}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
        {pics.length > 1 ? (
          <View className="mb-1 mt-3 flex-row justify-center gap-1.5">
            {pics.map((p, idx) => (
              <View key={p.id} className={`h-1.5 w-1.5 rounded-full ${idx === activeIdx ? "bg-acid" : "bg-hairline"}`} />
            ))}
          </View>
        ) : null}
        <View className="mt-4">
          {item.name ? <Row k="Name" v={item.name} /> : null}
          <Row k="Brand" v={item.brand} />
          <Row k="Category" v={`${deptLabel} · ${item.category}`} />
          <Row k="Condition" v={item.condition} />
          {specRowsFor(item as CatalogItem).map((r) => <Row key={r.k} k={r.k} v={r.v} />)}
          {item.individualCost > 0 ? <Row k="Cost" v={formatPeso(item.individualCost)} /> : null}
          <View className="flex-row items-baseline justify-between gap-4 border-b border-hairline px-3 py-3.5">
            <Text style={{ fontFamily: FONT.text, lineHeight: 21 }} className="text-[15px] text-inkfaint">Price</Text>
            <View className="flex-row items-baseline gap-2">
              {sold && item.soldPrice != null && item.soldPrice !== item.targetSellPrice ? (
                <Text style={{ fontFamily: FONT.medium, fontVariant: ["tabular-nums"], textDecorationLine: "line-through", lineHeight: 17 }} className="text-[12px] text-inkfaint">{formatPeso(item.targetSellPrice)}</Text>
              ) : null}
              <Text style={{ fontFamily: FONT.semibold, fontVariant: ["tabular-nums"], lineHeight: 21 }} className="text-[15px] text-acid">
                {formatPeso(sold && item.soldPrice != null ? item.soldPrice : item.targetSellPrice)}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        {sold
          ? <PrimaryButton label="Undo sold" onPress={() => unmarkSold(db, id)} />
          : <PrimaryButton label="Mark Sold" onPress={() => router.push(`/item/${id}/sold`)} />}
        <View className="mb-2 flex-row gap-2">
          <SecondaryButton label="Edit" icon="PencilSimple" onPress={() => router.push(`/session/${item.sessionId}/add?item=${id}`)} />
          <SecondaryButton label="Delete" icon="Trash" danger onPress={confirmDelete} />
        </View>
        <View className="mb-2 flex-row gap-2">
          <SecondaryButton label="Save photos" icon="Download" onPress={savePhotos} />
          <SecondaryButton label="Share to IG" icon="InstagramLogo" onPress={shareIG} />
        </View>
      </View>
    </View>
  );
}
