import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, ScrollView, TextInput, Pressable } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, eq } from "drizzle-orm";
import * as Haptics from "expo-haptics";
import { db } from "../../../db/client";
import { items, sessions, photos } from "../../../db/schema";
import { addItem, updateItem, addPhoto, replacePhoto } from "../../../lib/repo";
import { deleteFiles } from "../../../lib/media";
import { peekStagedPhotos, takeStagedPhotos, type SlotType } from "../../../lib/photo-staging";
import { CONDITIONS, COLORS, FONT } from "../../../lib/theme";
import { DEPARTMENTS, typesFor, specFieldsFor, type Department, type SpecField, type SpecKey } from "../../../lib/catalog";
import { formatPeso } from "../../../lib/format";
import { selectorProjected } from "../../../lib/math";
import { showError, showSuccess } from "../../../lib/toast";
import { Badge, Chip, FieldLabel, PrimaryButton } from "../../../components/ui";
import { AppHead } from "../../../components/AppHead";
import { Icon } from "../../../components/Icon";
import { Wheel, rangeValues } from "../../../components/Wheel";
import { PhotoSlot } from "../../../components/PhotoSlot";
import { BrandPickerSheet } from "../../../components/BrandPickerSheet";

const PRICE = [...rangeValues(50, 500, 10), ...rangeValues(550, 5000, 50)];
const COST = rangeValues(0, 2000, 10);
const SLOTS: SlotType[] = ["front", "back", "tag", "flaw"];

/** Untouched wheels rest at the field's declared default, or the range midpoint (snapped to step) when none is set. */
function wheelDefault(f: SpecField): number {
  if (f.default != null) return f.default;
  const { min, max, step } = f.wheel;
  return min + Math.round((max - min) / 2 / step) * step;
}

/** Wheel unit tag in the existing console voice: inches get the short + quote (`PTP "`), US/cm just the short (US, CM). */
function unitFor(f: SpecField): string {
  return f.unit === "in" ? `${f.short} "` : f.short;
}

/**
 * The Rapid Console. Mounted two ways:
 *  - `/session/[id]/add` — inside a batch, the way it has always worked.
 *  - `/item/new` (`noBatch`) — a loose item that belongs to no batch at all.
 *
 * Everything between those two modes is identical: departments, wheels, brand
 * picker, photo slots, save. Only the header, the batch tally and the cost
 * wheel (a loose item has no bale cost to allocate) differ.
 */
export default function RapidConsole({ noBatch = false }: { noBatch?: boolean } = {}) {
  const { id, item: editId } = useLocalSearchParams<{ id?: string; item?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // "" can never match a row, so the two batch queries return empty in no-batch
  // mode instead of being fed an undefined bind parameter.
  const sessionId = noBatch ? null : id ?? null;

  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).where(eq(sessions.id, sessionId ?? "")), [sessionId]);
  const { data: sessionItems } = useLiveQuery(db.select().from(items).where(eq(items.sessionId, sessionId ?? "")), [sessionId]);
  const { data: existingPhotoRows } = useLiveQuery(db.select().from(photos).where(eq(photos.itemId, editId ?? "")), [editId]);
  const session = sessionRows?.[0];
  // Bulto/selector allocation is a per-batch idea; a loose item is always cost 0.
  const withCost = session?.type === "selector";

  const [brand, setBrand] = useState("");
  const [brandPicker, setBrandPicker] = useState(false);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<Department>("tops");
  const [category, setCategory] = useState<string>(typesFor("tops")[0]);
  const [condition, setCondition] = useState<string>("9/10");
  const [specs, setSpecs] = useState<Partial<Record<SpecKey, number>>>({});
  const [sizeNote, setSizeNote] = useState("");
  const [moreSpecs, setMoreSpecs] = useState(false);
  const [price, setPrice] = useState(350);
  const [cost, setCost] = useState(0);
  const [staged, setStaged] = useState<Partial<Record<SlotType, string>>>({});
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

  // edit-mode prefill — department derives from the item (pre-migration rows default to tops)
  useEffect(() => {
    if (!editId) return;
    const existing = db.select().from(items).where(eq(items.id, editId)).all()[0];
    if (!existing) return;
    const dept = DEPARTMENTS.some((d) => d.key === existing.department) ? (existing.department as Department) : "tops";
    const fields = specFieldsFor(dept);
    const prefill: Partial<Record<SpecKey, number>> = {};
    for (const f of fields) {
      const v = existing[f.key];
      if (v != null) prefill[f.key] = v;
    }
    setBrand(existing.brand); setName(existing.name ?? ""); setCategory(existing.category); setCondition(existing.condition);
    setDepartment(dept); setSpecs(prefill); setSizeNote(existing.sizeNote ?? "");
    setMoreSpecs(fields.some((f) => f.extra && existing[f.key] != null));
    setPrice(existing.targetSellPrice); setCost(existing.individualCost);
  }, [editId]);

  const recentBrands = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const i of db.select().from(items).orderBy(desc(items.createdAt)).all()) {
      if (!seen.has(i.brand)) { seen.add(i.brand); out.push(i.brand); }
      if (out.length >= 4) break;
    }
    return out;
  }, [sessionItems?.length]);

  const specFields = useMemo(() => specFieldsFor(department), [department]);
  const wheelValues = useMemo(() => {
    const m = {} as Partial<Record<SpecKey, number[]>>;
    for (const f of specFields) m[f.key] = rangeValues(f.wheel.min, f.wheel.max, f.wheel.step);
    return m;
  }, [specFields]);
  const keyFields = specFields.filter((f) => !f.extra);
  const extraFields = specFields.filter((f) => f.extra);

  const switchDepartment = (d: Department) => {
    if (d === department) return;
    Haptics.selectionAsync();
    setDepartment(d);
    setCategory(typesFor(d)[0]);
    setSpecs({}); // repo also nulls foreign spec columns — belt and suspenders
    setSizeNote("");
    setMoreSpecs(false);
  };

  if (!noBatch && !session) return null;
  const filledSlots = SLOTS.filter((s) => staged[s] ?? existingPhotoMap[s]);
  // The camera is the same screen either way; only its route differs, because
  // the batch-less console has no `[id]` segment to hang it off.
  const cameraRoute = (slot: SlotType) =>
    `${noBatch ? "/item/new" : `/session/${id}`}/camera?slot=${slot}&filled=${encodeURIComponent(filledSlots.join(","))}`;

  const save = () => {
    if (saving) return; // double-tap guard
    if (!brand.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError("Brand is required — tap a chip or search brands");
      return;
    }
    setSaving(true);
    try {
      // Key-spec wheels save exactly what they show (default when untouched); extras only when the user actually set them.
      const specValues: Partial<Record<SpecKey, number | null>> = {};
      for (const f of specFields) specValues[f.key] = f.extra ? specs[f.key] ?? null : specs[f.key] ?? wheelDefault(f);
      const input = {
        sessionId, brand: brand.trim(), name, department, category, condition,
        ...specValues, sizeNote: department === "accessories" || department === "footwear" ? sizeNote.trim() || null : null,
        targetSellPrice: price, individualCost: withCost ? cost : 0,
      };
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
      router.back(); // back to the batch dashboard so the saved item is visible; `saving` stays true until unmount
    } catch {
      setSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError("Couldn't save — try again");
    }
  };

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead
        title={noBatch ? (editId ? "Edit item" : "New item") : session!.name}
        size={17}
        onBack={() => router.back()}
        right={
          noBatch
            ? <Badge label="No batch" />
            : <Badge label={`#${(sessionItems?.length ?? 0) + (editId ? 0 : 1)} · ${formatPeso(selectorProjected(sessionItems ?? []))}`} />
        }
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2 flex-none" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 flex-row gap-1 rounded-full border border-hairline bg-surface2 p-1">
            {DEPARTMENTS.map((d) => (
              <Pressable
                key={d.key}
                hitSlop={4}
                onPress={() => switchDepartment(d.key)}
                accessibilityRole="button"
                accessibilityLabel={d.label}
                accessibilityState={{ selected: department === d.key }}
                className={`h-9 flex-1 items-center justify-center rounded-full px-3.5 ${department === d.key ? "bg-acid" : ""}`}
              >
                <Text style={{ fontFamily: FONT.display, letterSpacing: 0.39 }} className={`text-[13px] uppercase ${department === d.key ? "text-acidink" : "text-inkdim"}`}>{d.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View className="mt-2.5 flex-row gap-2">
          {SLOTS.map((s) => (
            <PhotoSlot
              key={s}
              label={s.toUpperCase()}
              uri={staged[s] ?? existingPhotoMap[s] ?? null}
              onPress={() => router.push(cameraRoute(s) as Parameters<typeof router.push>[0])}
            />
          ))}
        </View>
        <FieldLabel>Brand</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {recentBrands.map((b) => <Chip key={b} label={b} selected={brand === b} onPress={() => setBrand(b)} />)}
        </ScrollView>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Search brands"
          onPress={() => setBrandPicker(true)}
          className="mt-2.5 h-11 justify-center rounded-full border border-hairline bg-surface2 px-4"
        >
          <Text style={{ fontFamily: FONT.text }} className={`text-[14px] ${brand ? "text-ink" : "text-inkfaint"}`}>{brand || "Search brands"}</Text>
        </Pressable>
        <FieldLabel>{"Item name · Optional"}</FieldLabel>
        <TextInput
          value={name} onChangeText={setName} maxLength={60}
          accessibilityLabel="Item name"
          placeholder="e.g. Detroit Jacket" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }}
          className="h-[52px] rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink"
        />
        <FieldLabel>Category</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {typesFor(department).map((c) => <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />)}
        </ScrollView>
        <FieldLabel>Condition</FieldLabel>
        <View className="flex-row gap-2 py-1">{CONDITIONS.map((c) => <Chip key={c} label={c} selected={condition === c} onPress={() => setCondition(c)} />)}</View>
        {keyFields.length > 0 ? (<>
          <FieldLabel>{keyFields.map((f) => f.label).join(" · ")}</FieldLabel>
          {keyFields.map((f, i) => (
            <View key={`${department}-${f.key}`}>
              {i > 0 ? <View className="h-3" /> : null}
              <Wheel values={wheelValues[f.key]!} value={specs[f.key] ?? wheelDefault(f)} onChange={(v) => setSpecs((s) => ({ ...s, [f.key]: v }))} unit={unitFor(f)} />
            </View>
          ))}
        </>) : null}
        {extraFields.length > 0 ? (<>
          <Pressable
            hitSlop={4}
            onPress={() => { Haptics.selectionAsync(); setMoreSpecs((v) => !v); }}
            accessibilityRole="button"
            accessibilityLabel="More specs"
            accessibilityState={{ expanded: moreSpecs }}
            className="mt-4 h-11 flex-row items-center gap-1"
          >
            <Text style={{ fontFamily: FONT.semibold, letterSpacing: 0.92, lineHeight: 16 }} className="text-[11.5px] uppercase text-inkfaint">{moreSpecs ? "More specs" : "+ More specs"}</Text>
            <Icon name={moreSpecs ? "CaretDown" : "CaretRight"} size={12} color={COLORS.inkFaint} />
          </Pressable>
          {moreSpecs ? (<>
            <FieldLabel>{extraFields.map((f) => f.label).join(" · ")}</FieldLabel>
            {extraFields.map((f, i) => (
              <View key={`${department}-${f.key}`}>
                {i > 0 ? <View className="h-3" /> : null}
                <Wheel values={wheelValues[f.key]!} value={specs[f.key] ?? wheelDefault(f)} onChange={(v) => setSpecs((s) => ({ ...s, [f.key]: v }))} unit={unitFor(f)} />
              </View>
            ))}
          </>) : null}
        </>) : null}
        {department === "accessories" || department === "footwear" ? (<>
          <FieldLabel>{department === "footwear" ? "WIDTH / SIZE NOTE · OPTIONAL" : "Size note"}</FieldLabel>
          <TextInput
            value={sizeNote} onChangeText={setSizeNote} maxLength={40}
            accessibilityLabel="Size note"
            placeholder="e.g. One size · 7 1/4" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }}
            className="h-[52px] rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink"
          />
        </>) : null}
        {withCost ? (<>
          <FieldLabel>{"Cost · Price"}</FieldLabel>
          <View className="flex-row gap-2.5">
            <View className="flex-1"><Wheel values={COST} value={cost} onChange={setCost} unit="COST ₱" allowCustom /></View>
            <View className="flex-[1.4]"><Wheel values={PRICE} value={price} onChange={setPrice} unit="₱" allowCustom /></View>
          </View>
        </>) : (<>
          <FieldLabel>Target price</FieldLabel>
          <Wheel values={PRICE} value={price} onChange={setPrice} unit="₱" allowCustom />
        </>)}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label={editId ? "Save changes" : "Save item"} icon="Check" onPress={save} disabled={saving} />
      </View>
      <BrandPickerSheet
        visible={brandPicker} value={brand} recents={recentBrands}
        onPick={(n) => { setBrand(n); setBrandPicker(false); }}
        onClose={() => setBrandPicker(false)}
      />
    </View>
  );
}
