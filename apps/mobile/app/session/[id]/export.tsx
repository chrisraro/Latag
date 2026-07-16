import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import { items, photos, sessions } from "../../../db/schema";
import { formatCaption } from "../../../lib/caption";
import { captionSpecLine, type CatalogItem } from "../../../lib/catalog";
import { formatPeso } from "../../../lib/format";
import { savePhotosToAlbum } from "../../../lib/albums";
import { shareToInstagram } from "../../../lib/ig-share";
import { FONT, COLORS } from "../../../lib/theme";
import { showSuccess, showError } from "../../../lib/toast";
import { Badge, FieldLabel, PrimaryButton, SecondaryButton } from "../../../components/ui";
import { AppHead } from "../../../components/AppHead";
import { Icon } from "../../../components/Icon";

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: itemRows } = useLiveQuery(db.select().from(items).where(eq(items.sessionId, id)).orderBy(desc(items.createdAt)), [id]);
  const { data: photoRows } = useLiveQuery(db.select().from(photos), []);
  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).where(eq(sessions.id, id)), [id]);
  const all = itemRows ?? [];
  const sessionName = sessionRows?.[0]?.name ?? null;
  const thumbOf = (itemId: string) => (photoRows ?? []).find((p) => p.itemId === itemId && p.type === "front")?.localUri ?? null;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [captionFocused, setCaptionFocused] = useState(false);

  useEffect(() => { setSelected(new Set(all.filter((i) => i.status === "available").map((i) => i.id))); }, [itemRows?.length]);

  const chosen = all.filter((i) => selected.has(i.id));
  // Regenerate the caption from the template whenever the selection changes;
  // manual edits apply on top and reset on the next selection change.
  useEffect(() => { setCaption(formatCaption(chosen)); }, [selected, itemRows]);
  const toggle = (itemId: string) => setSelected((prev) => { const n = new Set(prev); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n; });
  const [savingImages, setSavingImages] = useState(false); // double-tap guard
  const saveAllImages = async () => {
    if (savingImages) return; // double-tap guard
    setSavingImages(true);
    try {
      // Selection semantics: save the selected items' photos; when nothing is
      // selected, fall back to every item's photos.
      const targets = chosen.length > 0 ? chosen : all;
      const uris = targets.flatMap((i) => (photoRows ?? []).filter((p) => p.itemId === i.id).map((p) => p.localUri));
      const res = await savePhotosToAlbum(uris, sessionName);
      if (res.ok) showSuccess(`Saved ${res.count} photo(s) to "${res.album}"`);
      else if (res.reason === "permission") showError("Photos permission needed — enable it in system settings");
      else if (res.reason === "empty") showError("No photos to save");
      else showError("Couldn't save photos — try again");
    } finally {
      setSavingImages(false);
    }
  };
  const copy = async () => {
    if (chosen.length === 0 || !caption.trim()) return;
    await Clipboard.setStringAsync(caption);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSuccess(`Copied ${chosen.length} listings to clipboard`);
  };
  const [sharing, setSharing] = useState(false); // double-tap guard
  const shareIG = async () => {
    if (sharing) return; // double-tap guard
    setSharing(true);
    try {
      const uris = chosen.flatMap((i) => (photoRows ?? []).filter((p) => p.itemId === i.id).map((p) => p.localUri));
      const res = await shareToInstagram({ uris, caption, sessionName });
      if (res.step === "saved-opened") showSuccess("Photos saved + caption copied — paste it in your IG post");
      else if (res.step === "saved-only") showSuccess("Photos saved + caption copied — open Instagram to post");
      else if (res.step === "permission") showError("Photos permission needed — enable it in system settings");
      else if (res.step === "empty") showError("No photos to save");
      else showError("Couldn't save photos — try again");
    } finally {
      setSharing(false);
    }
  };

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead
        title="IG Drop"
        onBack={() => router.back()}
        right={<Badge label={`${chosen.length} SELECTED`} />}
      />
      <ScrollView className="max-h-56">
        {all.map((i) => {
          const checked = selected.has(i.id);
          const uri = thumbOf(i.id);
          const spec = captionSpecLine(i as CatalogItem);
          return (
            <Pressable
              key={i.id}
              onPress={() => toggle(i.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={i.brand}
              className="flex-row items-center gap-3 border-b border-hairline px-3 py-3.5"
            >
              <View className={`h-6 w-6 items-center justify-center rounded-lg border-[1.5px] ${checked ? "border-acid bg-acid" : "border-hairline"}`}>
                {checked ? <Icon name="Check" size={14} color={COLORS.acidInk} /> : null}
              </View>
              <View className="h-11 w-11 flex-none items-center justify-center rounded-[8px] border border-hairline bg-surface2">
                {uri ? (
                  <Image source={{ uri }} recyclingKey={uri} style={{ width: 44, height: 44, borderRadius: 8 }} contentFit="cover" />
                ) : (
                  <Text style={{ fontFamily: FONT.bold }} className="text-[15px] text-inkfaint">{i.brand[0]}</Text>
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Text style={{ fontFamily: FONT.semibold, lineHeight: 21 }} className={`text-[15px] ${checked ? "text-ink" : "text-inkdim"}`} numberOfLines={1}>
                  {i.brand}
                  {i.name ? <Text className="text-inkdim"> · {i.name}</Text> : null}
                </Text>
                <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 17 }} className="mt-0.5 text-[12px] text-inkfaint" numberOfLines={1}>
                  {i.category} · {i.condition}{spec ? ` · ${spec}` : ""}
                </Text>
              </View>
              <Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"], lineHeight: 21 }} className="ml-1 text-[15px] text-ink">{formatPeso(i.targetSellPrice)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <FieldLabel>Caption — tap to edit</FieldLabel>
      <TextInput
        value={caption}
        onChangeText={setCaption}
        multiline
        textAlignVertical="top"
        scrollEnabled
        editable={chosen.length > 0}
        onFocus={() => setCaptionFocused(true)}
        onBlur={() => setCaptionFocused(false)}
        placeholder="Select items to build the drop caption."
        placeholderTextColor="#8A8A8A"
        accessibilityLabel="Drop caption editor"
        style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }}
        className={`flex-1 rounded-card border bg-surface1 px-4 py-4 text-[13.5px] leading-[22px] text-inkdim ${captionFocused ? "border-acid" : "border-hairline"}`}
      />
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label="Share to IG" icon="InstagramLogo" onPress={shareIG} disabled={chosen.length === 0 || !caption.trim()} />
        <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className="mb-3 -mt-1 text-[11.5px] text-inkfaint">
          IG doesn't allow direct multi-photo posting from apps — your photos land in the gallery first, caption's on your clipboard.
        </Text>
        <View className="mb-2 flex-row gap-2">
          <SecondaryButton label="Copy caption" icon="ClipboardText" onPress={copy} />
          <SecondaryButton label="Save all images" icon="Download" onPress={saveAllImages} />
        </View>
      </View>
    </View>
  );
}
