import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SHOP_URL_PREFIX,
  cacheShop,
  cachedShop,
  checkHandleAvailable,
  getMyShop,
  isValidHandle,
  normalizeContactHandle,
  normalizeHandle,
  saveMyShop,
} from "../../lib/shop-api";
import { showError, showSuccess } from "../../lib/toast";
import { FONT, COLORS } from "../../lib/theme";
import { FieldLabel, PrimaryButton } from "../../components/ui";

/**
 * Shop setup — the seller's one public identity. The handle is checked live
 * (advisory only; the unique index is the real arbiter, so a race still lands
 * as an inline "taken" rather than a lie), and every failure mode keeps the
 * form open with the typed values intact.
 */

const HANDLE_DEBOUNCE_MS = 500;
const BIO_MAX = 160;

type HandleState = "idle" | "checking" | "available" | "taken";

function blankToNull(v: string): string | null {
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function contactOrNull(v: string): string | null {
  return blankToNull(normalizeContactHandle(v));
}

/**
 * A labelled switch row. The pill geometry (46x28, acid when on) matches the
 * Publish switch on app/item/[id] so the two read as the same control — that
 * one carries an icon and a gating hint, which is why it keeps its own markup.
 */
function ToggleRow({
  label,
  helper,
  value,
  onToggle,
}: {
  label: string;
  helper: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={onToggle}
      className="mb-2 flex-row items-center gap-3 rounded-card border border-hairline bg-surface1 px-3 py-3.5"
    >
      <View className="min-w-0 flex-1">
        <Text style={{ fontFamily: FONT.semibold, lineHeight: 20 }} className="text-[14.5px] text-ink">
          {label}
        </Text>
        <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="mt-0.5 text-[12px] text-inkfaint">
          {helper}
        </Text>
      </View>
      <View className={`h-7 w-[46px] flex-none justify-center rounded-full border ${value ? "border-acid bg-acid" : "border-hairline bg-surface2"}`}>
        <View
          style={{ marginHorizontal: 3 }}
          className={`h-5 w-5 rounded-full ${value ? "self-end bg-acidink" : "self-start bg-inkfaint"}`}
        />
      </View>
    </Pressable>
  );
}

export default function ShopSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === "1";

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [messenger, setMessenger] = useState("");
  const [instagram, setInstagram] = useState("");
  const [email, setEmail] = useState("");
  const [showSold, setShowSold] = useState(false);
  // A new shop is live the moment it is saved — that is the point of setting one
  // up. `shops.is_published` defaults to true for the same reason.
  const [isPublished, setIsPublished] = useState(true);
  const [ready, setReady] = useState(false);
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [takenOnSave, setTakenOnSave] = useState(false);
  const [saving, setSaving] = useState(false);
  /** The handle already saved for this shop — re-saving it must not read as taken. */
  const savedHandle = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getMyShop();
      const p = res.ok ? res.data : await cachedShop();
      if (!alive) return;
      if (p) {
        setHandle(p.handle);
        setDisplayName(p.displayName);
        setBio(p.bio ?? "");
        setMessenger(p.contactMessenger ?? "");
        setInstagram(p.contactInstagram ?? "");
        setEmail(p.contactEmail ?? "");
        setShowSold(p.showSold);
        setIsPublished(p.isPublished);
        savedHandle.current = p.handle;
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  // Live availability, debounced so a fast typist makes one request, not ten.
  useEffect(() => {
    if (!ready) return;
    const h = normalizeHandle(handle);
    if (h === savedHandle.current || !isValidHandle(h)) {
      setHandleState("idle");
      return;
    }
    setHandleState("checking");
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        const res = await checkHandleAvailable(h);
        if (!alive) return;
        // Offline: say nothing rather than accuse a perfectly good handle.
        if (!res.ok) { setHandleState("idle"); return; }
        setHandleState(res.data ? "available" : "taken");
      })();
    }, HANDLE_DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [handle, ready]);

  const normalized = normalizeHandle(handle);
  const canSave = isValidHandle(normalized) && displayName.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const res = await saveMyShop({
      handle: normalized,
      displayName: displayName.trim(),
      bio: blankToNull(bio),
      contactMessenger: contactOrNull(messenger),
      contactInstagram: contactOrNull(instagram),
      contactEmail: contactOrNull(email),
      showSold,
      isPublished,
    });
    setSaving(false);

    if (res.ok) {
      void cacheShop(res.data);
      showSuccess("Shop saved");
      router.back();
      return;
    }
    if (res.reason === "taken") {
      setTakenOnSave(true);
      setHandleState("taken");
      return;
    }
    if (res.reason === "auth") {
      showError("Sign in first to set up your shop", {
        sticky: true,
        onPress: () => router.push("/auth/sign-in"),
      });
      return;
    }
    if (res.reason === "network") {
      showError("Couldn't save your shop — check your connection and try again");
      return;
    }
    showError(res.message || "Couldn't save your shop");
  };

  const inputCls = "h-[52px] rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink";
  const helperCls = "mt-1.5 text-[11.5px] text-inkfaint";

  const handleHint = takenOnSave
    ? { text: "That link was just taken — try another", cls: "text-danger" }
    : handleState === "checking"
      ? { text: "Checking…", cls: "text-inkfaint" }
      : handleState === "available"
        ? { text: "Available", cls: "text-acid" }
        : handleState === "taken"
          ? { text: "Taken — try another", cls: "text-danger" }
          : { text: "3-20 characters: letters, numbers, dashes", cls: "text-inkfaint" };

  return (
    <View className="flex-1 bg-surface1 px-5" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}>
      <View className="mb-3.5 h-1 w-11 self-center rounded-full bg-handle" />
      <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">{editing ? "Edit shop" : "Set up your shop"}</Text>
      <Text style={{ fontFamily: FONT.text, lineHeight: 18 }} className="mb-1 mt-1 text-[12.5px] text-inkfaint">
        One link buyers can open, browse, and message you from.
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="flex-1">
        <FieldLabel>Shop link</FieldLabel>
        <View className="h-[52px] flex-row items-center rounded-[14px] border border-hairline bg-surface2 px-4">
          <Text style={{ fontFamily: FONT.text, lineHeight: 20 }} className="text-[15px] text-inkfaint">{SHOP_URL_PREFIX}</Text>
          <TextInput
            value={handle}
            onChangeText={(v) => { setHandle(v); setTakenOnSave(false); }}
            accessibilityLabel="Shop link"
            placeholder="yourshop"
            placeholderTextColor={COLORS.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            style={{ fontFamily: FONT.semibold }}
            className="h-full flex-1 text-[15px] text-ink"
          />
        </View>
        <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className={`${helperCls} ${handleHint.cls}`}>{handleHint.text}</Text>

        <FieldLabel>Shop name</FieldLabel>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          accessibilityLabel="Shop name"
          placeholder="What buyers will see"
          placeholderTextColor={COLORS.inkFaint}
          maxLength={50}
          style={{ fontFamily: FONT.text }}
          className={inputCls}
        />

        <FieldLabel>Bio · optional</FieldLabel>
        <TextInput
          value={bio}
          onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
          accessibilityLabel="Bio"
          placeholder="One line about what you sell"
          placeholderTextColor={COLORS.inkFaint}
          multiline
          maxLength={BIO_MAX}
          style={{ fontFamily: FONT.text, textAlignVertical: "top" }}
          className="h-[84px] rounded-[14px] border border-hairline bg-surface2 px-4 py-3 text-[15px] text-ink"
        />
        <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"], lineHeight: 16 }} className={`${helperCls} text-right`}>
          {bio.length}/{BIO_MAX}
        </Text>

        <FieldLabel>Visibility</FieldLabel>
        <ToggleRow
          label="Shop is live"
          helper="Turning this off hides your whole page. Your items stay published — they come back the moment you switch it on."
          value={isPublished}
          onToggle={() => setIsPublished((v) => !v)}
        />
        <ToggleRow
          label="Show sold items"
          helper="Sold pieces stay visible with a SOLD badge — good social proof."
          value={showSold}
          onToggle={() => setShowSold((v) => !v)}
        />

        <FieldLabel>Contacts</FieldLabel>
        <Text style={{ fontFamily: FONT.text, lineHeight: 18 }} className="mb-3 text-[12.5px] text-inkdim">
          Each one you fill in becomes a button on your shop page. Leave the rest blank.
        </Text>

        <TextInput
          value={messenger}
          onChangeText={setMessenger}
          accessibilityLabel="Messenger username"
          placeholder="Messenger username"
          placeholderTextColor={COLORS.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ fontFamily: FONT.text }}
          className={inputCls}
        />
        <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className={`${helperCls} mb-3`}>
          Opens your chat with the item and price already typed in.
        </Text>

        <TextInput
          value={instagram}
          onChangeText={setInstagram}
          accessibilityLabel="Instagram username"
          placeholder="Instagram username"
          placeholderTextColor={COLORS.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ fontFamily: FONT.text }}
          className={inputCls}
        />
        <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className={`${helperCls} mb-3`}>
          Opens your DMs. Instagram can&apos;t prefill, so the message is copied for them to paste.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="Email address"
          placeholder="Email address"
          placeholderTextColor={COLORS.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={{ fontFamily: FONT.text }}
          className={inputCls}
        />
        <Text style={{ fontFamily: FONT.text, lineHeight: 16 }} className={helperCls}>
          Opens their mail app with the item, code and price drafted.
        </Text>
      </ScrollView>

      <PrimaryButton label={saving ? "Saving…" : "Save shop"} onPress={() => void save()} disabled={!canSave} />
    </View>
  );
}
