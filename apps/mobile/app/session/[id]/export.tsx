import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import { items } from "../../../db/schema";
import { formatCaption } from "../../../lib/caption";
import { formatPeso } from "../../../lib/format";
import { FONT, COLORS } from "../../../lib/theme";
import { showSuccess } from "../../../lib/toast";
import { Badge, FieldLabel, PrimaryButton } from "../../../components/ui";
import { AppHead } from "../../../components/AppHead";
import { Icon } from "../../../components/Icon";

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: itemRows } = useLiveQuery(db.select().from(items).where(eq(items.sessionId, id)).orderBy(desc(items.createdAt)), [id]);
  const all = itemRows ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [captionFocused, setCaptionFocused] = useState(false);

  useEffect(() => { setSelected(new Set(all.filter((i) => i.status === "available").map((i) => i.id))); }, [itemRows?.length]);

  const chosen = all.filter((i) => selected.has(i.id));
  // Regenerate the caption from the template whenever the selection changes;
  // manual edits apply on top and reset on the next selection change.
  useEffect(() => { setCaption(formatCaption(chosen)); }, [selected, itemRows]);
  const toggle = (itemId: string) => setSelected((prev) => { const n = new Set(prev); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n; });
  const copy = async () => {
    await Clipboard.setStringAsync(caption);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSuccess(`Copied ${chosen.length} listings to clipboard`);
  };

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead
        title="IG Drop"
        onBack={() => router.back()}
        right={<Badge label={`${chosen.length} SELECTED`} />}
      />
      <ScrollView className="max-h-56">
        {all.map((i) => (
          <Pressable key={i.id} onPress={() => toggle(i.id)} className="flex-row items-center gap-3 border-b border-hairline px-1 py-3.5">
            <View className={`h-6 w-6 items-center justify-center rounded-lg border-[1.5px] ${selected.has(i.id) ? "border-acid bg-acid" : "border-hairline"}`}>
              {selected.has(i.id) ? <Icon name="Check" size={14} color={COLORS.acidInk} /> : null}
            </View>
            <Text style={{ fontFamily: FONT.semibold, lineHeight: 21 }} className={`flex-1 text-[15px] ${selected.has(i.id) ? "text-ink" : "text-inkdim"}`} numberOfLines={1}>{i.brand} {i.category}</Text>
            <Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"], lineHeight: 21 }} className="ml-1 text-[15px] text-ink">{formatPeso(i.targetSellPrice)}</Text>
          </Pressable>
        ))}
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
        <PrimaryButton label="Copy to Clipboard" icon="ClipboardText" onPress={copy} disabled={chosen.length === 0 || !caption.trim()} />
      </View>
    </View>
  );
}
