import { useEffect, useState } from "react";
import { View, Text, Alert, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { entitlements, items, photos, sessions } from "../../../db/schema";
import { unmarkSold, deleteItem, enqueuePublish, generateShopCode, markPublished, markUnpublished } from "../../../lib/repo";
import { kickSync } from "../../../lib/shop-sync";
import { deleteFiles } from "../../../lib/media";
import { savePhotosToAlbum } from "../../../lib/albums";
import { shareToInstagram } from "../../../lib/ig-share";
import { formatCaption } from "../../../lib/caption";
import { cacheShop, cachedShop, getMyShop, shopItemUrl } from "../../../lib/shop-api";
import { showSuccess, showError } from "../../../lib/toast";
import { FONT, COLORS } from "../../../lib/theme";
import { formatPeso } from "../../../lib/format";
import { DEPARTMENTS, specRowsFor, type CatalogItem } from "../../../lib/catalog";
import { Badge, PrimaryButton, SecondaryButton } from "../../../components/ui";
import { AppHead } from "../../../components/AppHead";
import { Icon } from "../../../components/Icon";

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: itemRows } = useLiveQuery(db.select().from(items).where(eq(items.id, id)), [id]);
  const { data: photoRows } = useLiveQuery(db.select().from(photos).where(eq(photos.itemId, id)), [id]);
  const item = itemRows?.[0];
  const sessionId = item?.sessionId ?? "";
  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).where(eq(sessions.id, sessionId)), [sessionId]);
  const { data: entRows } = useLiveQuery(db.select().from(entitlements), []);
  const [carouselW, setCarouselW] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [savingPhotos, setSavingPhotos] = useState(false); // double-tap guard
  const [shopHandle, setShopHandle] = useState<string | null>(null);
  const pro = entRows?.[0]?.pro === true;

  // Publishing needs a shop to publish into. The cached handle answers first so
  // the toggle is usable in a market with no signal; the live read corrects it.
  useEffect(() => {
    if (!pro) return;
    let alive = true;
    void (async () => {
      const cached = await cachedShop();
      if (alive && cached) setShopHandle(cached.handle);
      const res = await getMyShop();
      if (!alive || !res.ok) return;
      setShopHandle(res.data?.handle ?? null);
      void cacheShop(res.data);
    })();
    return () => { alive = false; };
  }, [pro]);

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
      else if (res.step === "saved-no-launch") showSuccess("Photos saved + caption copied — open Instagram to post");
      else if (res.step === "saved-no-caption") showError("Photos saved — couldn't copy the caption, copy it manually");
      else if (res.step === "permission") showError("Photos permission needed — enable it in system settings");
      else if (res.step === "empty") showError("No photos to save");
      else showError("Couldn't save photos — try again");
    } finally {
      setSavingPhotos(false);
    }
  };

  const published = item.publishedAt != null;
  // A shop is required to publish INTO one; taking something down only ever
  // needs the item itself, so an offline or lapsed seller is never trapped
  // with stock live on a page they can no longer control.
  const canPublish = pro && shopHandle != null;
  const canToggle = published || canPublish;

  const togglePublish = () => {
    if (!canToggle) {
      router.navigate("/shop");
      return;
    }
    if (published) {
      markUnpublished(db, id);
      enqueuePublish(db, id, "delete");
      // C1: nudge the drain now — without this the listing stays PUBLICLY LIVE
      // until the app happens to background and reopen, which makes this toast
      // a false statement about public data.
      kickSync(db);
      showSuccess("Removed from shop");
      return;
    }
    // Codes are permanent: a republished item keeps the one buyers already have
    // from a screenshot or a message thread.
    markPublished(db, id, item.shopCode ?? generateShopCode(db));
    enqueuePublish(db, id, "upsert");
    kickSync(db);
    showSuccess("Publishing — your shop updates shortly");
  };

  const copyItemLink = async () => {
    const url = shopItemUrl(shopHandle ?? "", item.shopCode);
    try {
      await Clipboard.setStringAsync(url);
      showSuccess("Item link copied");
    } catch {
      showError(`Couldn't copy — the link is ${url}`);
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
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Published to shop"
          accessibilityState={{ checked: published }}
          accessibilityHint={canToggle ? undefined : "Opens the Shop tab to set up your shop"}
          onPress={togglePublish}
          className="mb-2 flex-row items-center gap-3 rounded-card border border-hairline bg-surface1 px-3 py-3.5"
        >
          <Icon name="Storefront" size={19} color={published ? COLORS.acid : COLORS.inkFaint} />
          <View className="min-w-0 flex-1">
            <Text style={{ fontFamily: FONT.semibold, lineHeight: 20 }} className={`text-[14.5px] ${canToggle ? "text-ink" : "text-inkdim"}`}>
              Published to shop
            </Text>
            {!canToggle ? (
              <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="mt-0.5 text-[12px] text-inkfaint">
                Set up your shop to publish
              </Text>
            ) : published && item.shopCode ? (
              <Text
                style={{ fontFamily: FONT.medium, fontVariant: ["tabular-nums"], lineHeight: 17 }}
                className="mt-0.5 text-[12px] text-inkfaint"
              >
                {item.shopCode}
              </Text>
            ) : null}
          </View>
          {/* 46x28 pill, acid when on — the mockup's switch. */}
          <View className={`h-7 w-[46px] flex-none justify-center rounded-full border ${published ? "border-acid bg-acid" : "border-hairline bg-surface2"}`}>
            <View
              style={{ marginHorizontal: 3 }}
              className={`h-5 w-5 rounded-full ${published ? "self-end bg-acidink" : "self-start bg-inkfaint"}`}
            />
          </View>
        </Pressable>
        {published && shopHandle ? (
          <View className="mb-2 flex-row">
            <SecondaryButton label="Copy item link" icon="ClipboardText" onPress={() => void copyItemLink()} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
