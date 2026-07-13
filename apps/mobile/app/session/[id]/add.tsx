import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, eq } from "drizzle-orm";
import * as Haptics from "expo-haptics";
import { db } from "../../../db/client";
import { items, entitlements, sessions, photos } from "../../../db/schema";
import { addItem, updateItem, addPhoto, replacePhoto } from "../../../lib/repo";
import { deleteFiles } from "../../../lib/media";
import { FreeTierExhaustedError, logsRemaining, ensureEntitlements } from "../../../lib/entitlements";
import { peekStagedPhotos, takeStagedPhotos, type SlotType } from "../../../lib/photo-staging";
import { CATEGORIES, CONDITIONS, FONT } from "../../../lib/theme";
import { formatPeso } from "../../../lib/format";
import { selectorProjected } from "../../../lib/math";
import { showError, showSuccess } from "../../../lib/toast";
import { Chip, FieldLabel, PrimaryButton } from "../../../components/ui";
import { Wheel, rangeValues } from "../../../components/Wheel";
import { PhotoSlot } from "../../../components/PhotoSlot";
import { GoProSheet } from "../../../components/GoProSheet";

const PTP = rangeValues(14, 36, 0.5);
const LEN = rangeValues(20, 36, 0.5);
const PRICE = [...rangeValues(50, 500, 10), ...rangeValues(550, 5000, 50)];
const COST = rangeValues(0, 2000, 10);
const SLOTS: SlotType[] = ["front", "back", "tag", "flaw"];

export default function RapidConsole() {
  const { id, item: editId } = useLocalSearchParams<{ id: string; item?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).where(eq(sessions.id, id)), [id]);
  const { data: sessionItems } = useLiveQuery(db.select().from(items).where(eq(items.sessionId, id)), [id]);
  const { data: entRows } = useLiveQuery(db.select().from(entitlements), []);
  const { data: existingPhotoRows } = useLiveQuery(db.select().from(photos).where(eq(photos.itemId, editId ?? "")), [editId]);
  const session = sessionRows?.[0];

  const [brand, setBrand] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [condition, setCondition] = useState<string>("9/10");
  const [ptp, setPtp] = useState(21);
  const [len, setLen] = useState(27);
  const [price, setPrice] = useState(350);
  const [cost, setCost] = useState(0);
  const [staged, setStaged] = useState<Partial<Record<SlotType, string>>>({});
  const [goPro, setGoPro] = useState(false);
  const [saving, setSaving] = useState(false); // idempotency: block double-fire until we navigate away

  // pull staged photos whenever we regain focus from the camera
  useFocusEffect(useCallback(() => { setStaged(peekStagedPhotos()); }, []));

  // Abandoned staged photos must not leak into the next console mount.
  // Their files become disk orphans, reclaimed by sweepOrphans on next boot.
  useEffect(() => () => { takeStagedPhotos(); }, []);

  // edit mode: prefill the slots from the item's existing photos; a freshly staged
  // capture for a slot overrides the existing photo for display purposes only.
  const existingPhotoMap = useMemo(() => {
    const map: Partial<Record<SlotType, string>> = {};
    for (const p of existingPhotoRows ?? []) map[p.type as SlotType] = p.localUri;
    return map;
  }, [existingPhotoRows]);

  // edit-mode prefill
  useEffect(() => {
    if (!editId) return;
    const existing = db.select().from(items).where(eq(items.id, editId)).all()[0];
    if (!existing) return;
    setBrand(existing.brand); setCategory(existing.category); setCondition(existing.condition);
    setPtp(existing.ptpInches); setLen(existing.lengthInches); setPrice(existing.targetSellPrice); setCost(existing.individualCost);
  }, [editId]);

  const recentBrands = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const i of db.select().from(items).orderBy(desc(items.createdAt)).all()) {
      if (!seen.has(i.brand)) { seen.add(i.brand); out.push(i.brand); }
      if (out.length >= 4) break;
    }
    return out;
  }, [sessionItems?.length]);

  if (!session) return null;
  const ent = entRows?.[0] ?? ensureEntitlements(db);
  const remaining = logsRemaining(ent);

  const save = () => {
    if (saving) return; // double-tap guard
    if (!brand.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError("Brand is required — tap a chip or type it");
      return;
    }
    setSaving(true);
    try {
      const input = { sessionId: id, brand: brand.trim(), category, condition, ptpInches: ptp, lengthInches: len, targetSellPrice: price, individualCost: session.type === "selector" ? cost : 0 };
      const saved = editId ? { item: updateItem(db, editId, input) } : addItem(db, input);
      const shots = takeStagedPhotos();
      for (const slot of SLOTS) {
        const uri = shots[slot];
        if (!uri) continue; // untouched slots are left alone entirely
        if (editId) {
          const { replacedUris } = replacePhoto(db, { itemId: saved.item.id, localUri: uri, type: slot });
          if (replacedUris.length) deleteFiles(replacedUris).catch(() => {});
        } else {
          addPhoto(db, { itemId: saved.item.id, localUri: uri, type: slot });
        }
      }
      setStaged({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSuccess(editId ? "Changes saved" : `${input.brand} ${input.category} logged — ${formatPeso(input.targetSellPrice)}`);
      router.back(); // back to the session/detail so the saved item is visible; `saving` stays true until unmount
    } catch (e) {
      setSaving(false);
      if (e instanceof FreeTierExhaustedError) { setGoPro(true); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError("Couldn't save — try again");
    }
  };

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2"><Text className="text-[18px] text-inkdim">‹</Text></Pressable>
        <Text style={{ fontFamily: FONT.display }} className="flex-1 text-[17px] text-ink" numberOfLines={1}>{session.name}</Text>
        <Text style={{ fontFamily: FONT.semibold, fontVariant: ["tabular-nums"] }} className="text-[12px] text-inkfaint">
          #{(sessionItems?.length ?? 0) + (editId ? 0 : 1)} · {formatPeso(selectorProjected(sessionItems ?? []))}
          {Number.isFinite(remaining) && remaining <= 10 ? `  ·  ${remaining} free logs left` : ""}
        </Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
        <View className="flex-row gap-2">
          {SLOTS.map((s) => (
            <PhotoSlot key={s} label={s.toUpperCase()} uri={staged[s] ?? existingPhotoMap[s] ?? null} onPress={() => router.push(`/session/${id}/camera?slot=${s}`)} />
          ))}
        </View>
        <FieldLabel>Brand</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {recentBrands.map((b) => <Chip key={b} label={b} selected={brand === b} onPress={() => setBrand(b)} />)}
        </ScrollView>
        <TextInput
          value={brandQuery || brand} onChangeText={(t) => { setBrandQuery(t); setBrand(t); }}
          placeholder="Search / type brand" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }}
          className="mt-2 h-11 rounded-full border border-hairline bg-surface2 px-4 text-[14px] text-ink"
        />
        <FieldLabel>Category</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {CATEGORIES.map((c) => <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />)}
        </ScrollView>
        <FieldLabel>Condition</FieldLabel>
        <View className="flex-row gap-2 py-1">{CONDITIONS.map((c) => <Chip key={c} label={c} selected={condition === c} onPress={() => setCondition(c)} />)}</View>
        <FieldLabel>Pit-to-pit</FieldLabel>
        <Wheel values={PTP} value={ptp} onChange={setPtp} unit={'PTP "'} />
        <View className="h-2" />
        <Wheel values={LEN} value={len} onChange={setLen} unit={'L "'} />
        {session.type === "selector" ? (<>
          <FieldLabel>Cost · Price</FieldLabel>
          <View className="flex-row gap-2">
            <View className="flex-1"><Wheel values={COST} value={cost} onChange={setCost} unit="COST ₱" allowCustom /></View>
            <View className="flex-[1.4]"><Wheel values={PRICE} value={price} onChange={setPrice} unit="₱" allowCustom /></View>
          </View>
        </>) : (<>
          <FieldLabel>Target price</FieldLabel>
          <Wheel values={PRICE} value={price} onChange={setPrice} unit="₱" allowCustom />
        </>)}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label={editId ? "Save changes  ✓" : "Save item  ✓"} onPress={save} disabled={saving} />
      </View>
      <GoProSheet visible={goPro} onClose={() => setGoPro(false)} />
    </View>
  );
}
