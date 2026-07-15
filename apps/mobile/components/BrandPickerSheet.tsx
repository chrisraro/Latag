import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { db } from "../db/client";
import { FONT } from "../lib/theme";
import { suggestBrands, addUserBrand, listUserBrands, type BrandSuggestion } from "../lib/brands";
import seedBrands from "../data/brands.json";

const SEED = seedBrands as { name: string; tier: "core" | "common" }[];
const SOURCE_TAG: Record<BrandSuggestion["source"], string> = { recent: "recent", custom: "yours", seed: "" };
const nocase = (s: string) => s.trim().toLowerCase();

export function BrandPickerSheet({
  visible,
  value,
  recents,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: string;
  recents: string[];
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => { if (visible) setQuery(""); }, [visible]); // fresh search every open

  // Re-read user brands each open — additions happen through this sheet, which closes after.
  const custom = useMemo(() => (visible ? listUserBrands(db) : []), [visible]);
  const suggestions = useMemo(
    () => (visible ? suggestBrands(query, { recents, custom, seed: SEED }) : []),
    [visible, query, recents, custom],
  );

  const q = query.trim();
  // The add row leads only when NO pool holds the queried name (nocase) — checked against
  // full pools, not the limit-capped suggestion list, so a ranked-out exact match can't
  // spawn a duplicate.
  const exactExists = useMemo(() => {
    if (!q) return true;
    const key = nocase(q);
    return (
      recents.some((n) => nocase(n) === key) ||
      custom.some((n) => nocase(n) === key) ||
      SEED.some((s) => nocase(s.name) === key)
    );
  }, [q, recents, custom]);

  const pick = (name: string) => {
    Haptics.selectionAsync();
    onPick(name);
  };
  const addAndPick = () => {
    Haptics.selectionAsync();
    const { name } = addUserBrand(db, q); // dedupes nocase vs user_brands AND seed; returns canonical casing
    if (name) onPick(name);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" className="flex-1 bg-black/60" onPress={onClose} />
      <View className="rounded-t-sheet border-t border-hairline bg-surface1 px-5 pb-7 pt-3">
        <View className="mb-3.5 h-1 w-11 self-center rounded-full bg-[#3A3A3A]" />
        <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">Brand</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          accessibilityLabel="Search brands"
          placeholder="Search brands"
          placeholderTextColor="#8A8A8A"
          style={{ fontFamily: FONT.text }}
          className="mt-3 h-[52px] rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink"
        />
        <ScrollView style={{ maxHeight: 316 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} className="mt-2">
          {!exactExists ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add ${q}`}
              onPress={addAndPick}
              className="min-h-[44px] flex-row items-center border-b border-hairline px-3 py-3.5"
            >
              <Text style={{ fontFamily: FONT.semibold }} className="text-[15px] text-acid">{`+ Add "${q}"`}</Text>
            </Pressable>
          ) : null}
          {suggestions.map((s, i) => {
            const selected = !!value && nocase(s.name) === nocase(value);
            return (
              <Pressable
                key={s.name}
                accessibilityRole="button"
                accessibilityLabel={s.name}
                accessibilityState={{ selected }}
                onPress={() => pick(s.name)}
                className={`min-h-[44px] flex-row items-center justify-between px-3 py-3.5 ${i < suggestions.length - 1 ? "border-b border-hairline" : ""}`}
              >
                <Text style={{ fontFamily: FONT.semibold }} className={`text-[15px] ${selected ? "text-acid" : "text-ink"}`}>{s.name}</Text>
                {SOURCE_TAG[s.source] ? (
                  <Text style={{ fontFamily: FONT.text }} className="text-[11px] text-inkfaint">{SOURCE_TAG[s.source]}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
