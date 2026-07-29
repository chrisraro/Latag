import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { db } from "../../db/client";
import { entitlements } from "../../db/schema";
import { supabase } from "../../lib/supabase";
import { fetchLicense, applyLicense, clearLicense } from "../../lib/license";
import { ensureEntitlements } from "../../lib/entitlements";
import { checkProStatus, loginRevenueCat, isRevenueCatConfigured, restorePurchases } from "../../lib/purchases";
import type { ProStatus } from "../../lib/purchases";
import { showSuccess, showError } from "../../lib/toast";
import { forgetUploadedPhotos } from "../../lib/shop-sync";
import { FONT, COLORS } from "../../lib/theme";
import { FieldLabel } from "../../components/ui";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { AppHead } from "../../components/AppHead";
import { Icon, type IconName } from "../../components/Icon";

type Tone = "default" | "acid" | "danger";

function toneColor(tone: Tone | undefined): string {
  if (tone === "acid") return COLORS.acid;
  if (tone === "danger") return COLORS.danger;
  return COLORS.inkDim;
}

/** One `.set-row` per the settings mockup: 36px icon tile, semibold title, faint subtitle. */
function SettingsRow({
  icon,
  iconTone,
  title,
  titleTone,
  subtitle,
  subtitleTnum,
  onPress,
  chevron,
  last,
  noPadding,
}: {
  icon: IconName;
  iconTone?: Tone;
  title: string;
  titleTone?: Tone;
  subtitle?: string;
  subtitleTnum?: boolean;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
  noPadding?: boolean;
}) {
  const Wrapper = (onPress ? Pressable : View) as typeof Pressable;
  return (
    <Wrapper
      onPress={onPress}
      className={`flex-row items-center gap-3 px-3 ${noPadding ? "" : "py-3.5"} ${last ? "" : "border-b border-hairline"}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-surface2">
        <Icon name={icon} size={18} color={toneColor(iconTone)} />
      </View>
      <View className="flex-1">
        <Text style={{ fontFamily: FONT.semibold }} className={`text-[15px] ${titleTone === "acid" ? "text-acid" : titleTone === "danger" ? "text-danger" : "text-ink"}`} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text
            style={{ fontFamily: FONT.text, fontVariant: subtitleTnum ? ["tabular-nums"] : undefined, lineHeight: 17 }}
            className="mt-1 text-[12px] text-inkfaint"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {chevron ? <Icon name="CaretRight" size={16} color={COLORS.inkFaint} /> : null}
    </Wrapper>
  );
}

/** Format a date for the subscription status display. */
function formatExpiry(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diff = d.getTime() - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  const dateStr = d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  if (days > 30) return `Renews ${dateStr}`;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} left · ${dateStr}`;
  if (days === 0) return "Expires today";
  return "Expired";
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [usage, setUsage] = useState({ count: 0, bytes: 0, label: "0 B" });
  const [subscriptionLabel, setSubscriptionLabel] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reread, setReread] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { data: entRows } = useLiveQuery(db.select().from(entitlements), []);
  const ent = entRows?.[0];

  // ensureEntitlements is a write; it must never run during render.
  useEffect(() => {
    if (entRows && !entRows[0]) ensureEntitlements(db);
  }, [entRows]);

  // Keep the account row fresh across sign-in/out.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { getMediaUsage } = await import("../../lib/storage-usage");
        setUsage(await getMediaUsage());
      } catch {
        // Native module not available (OTA before rebuild)
      }
    })();
  }, []);

  // --- License refresh ---
  const refreshLicense = useCallback(async () => {
    if (refreshing || !session) return;
    setRefreshing(true);
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();
      if (!freshSession) {
        showError("Sign in first to check your license");
        return;
      }

      // 1. Try RevenueCat entitlement first
      if (isRevenueCatConfigured()) {
        await loginRevenueCat(freshSession.user.id);
        const rcPro = await checkProStatus();
        if (rcPro && (rcPro.kind === "active" || rcPro.kind === "trial")) {
          applyLicense(db, { receipt: "rc_entitlement", expiresAt: rcPro.expiresAt });
          const label = rcPro.kind === "trial"
            ? formatExpiry(rcPro.expiresAt)
            : formatExpiry(rcPro.expiresAt);
          setSubscriptionLabel(label);
          showSuccess("Pro active — yours while subscribed");
          return;
        }
        if (rcPro && rcPro.kind === "none") {
          clearLicense(db);
          setSubscriptionLabel(null);
          showSuccess("No Pro subscription on this account");
          return;
        }
        // rcPro === { kind: "error" } — fall through to HTTP
      }

      // 2. Fallback: HTTP license API
      const res = await fetchLicense(freshSession.access_token);
      if (res.kind === "pro") {
        applyLicense(db, { receipt: res.receipt, expiresAt: res.expiresAt });
        setSubscriptionLabel(formatExpiry(res.expiresAt));
        showSuccess("Pro active — yours while subscribed");
      } else if (res.kind === "none") {
        clearLicense(db);
        setSubscriptionLabel(null);
        showSuccess("No Pro subscription on this account");
      } else {
        showError("Couldn't check license — check your connection and try again");
      }
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, session]);

  // --- Sign out ---
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showError("Couldn't sign out — check your connection and try again");
      return;
    }
    forgetUploadedPhotos(db);
    setSubscriptionLabel(null);
    showSuccess("Signed out — your data stays on this phone");
  };

  // --- Restore purchases ---
  const handleRestore = async () => {
    try {
      const Haptics = await import("expo-haptics");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // expo-haptics not in build yet
    }
    const result = await restorePurchases();
    if (result.kind === "restored") {
      const pro = result.customerInfo.entitlements.active["pro"];
      if (pro) {
        applyLicense(db, { receipt: "rc_restored", expiresAt: pro.expirationDate ?? null });
        setSubscriptionLabel(formatExpiry(pro.expirationDate ?? null));
      }
      showSuccess("Purchases restored — Pro is active again");
    } else if (result.kind === "nothing") {
      showSuccess("No previous purchases to restore on this account");
    } else {
      showError("Couldn't restore purchases — check your internet and try again");
    }
  };

  // --- Export backup ---
  const handleExportBackup = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportBackup } = await import("../../lib/backup");
      const result = await exportBackup();
      if (result.ok) {
        showSuccess("Backup exported — share it to save to another device");
      } else {
        showError(`Export failed: ${result.error}`);
      }
    } catch {
      showError("Export not available — upgrade the app to enable backup");
    } finally {
      setExporting(false);
    }
  };

  // --- Import backup ---
  const handleImportBackup = async () => {
    if (importing) return;

    Alert.alert(
      "Import Backup",
      "This will replace ALL current data with the backup. This cannot be undone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import",
          style: "destructive",
          onPress: async () => {
            setImporting(true);
            try {
              const DocumentPicker = await import("expo-document-picker");
              const result = await DocumentPicker.getDocumentAsync({
                type: "application/json",
                copyToCacheDirectory: true,
              });

              if (result.canceled || !result.assets?.[0]) {
                setImporting(false);
                return;
              }

              const { readBackupFile, restoreBackup } = await import("../../lib/backup");
              const readResult = await readBackupFile(result.assets[0].uri);
              if (!readResult.ok) {
                showError(`Invalid backup: ${readResult.error}`);
                return;
              }

              const restoreResult = await restoreBackup(readResult.data);
              if (restoreResult.ok) {
                const counts = Object.entries(restoreResult.counts)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(", ");
                showSuccess(`Restored: ${counts}`);
                setReread((n) => n + 1);
              } else {
                showError(`Restore failed: ${restoreResult.error}`);
              }
            } catch {
              showError("Import not available — upgrade the app to enable backup");
            } finally {
              setImporting(false);
            }
          },
        },
      ],
    );
  };

  // --- Check for updates ---
  const checkForUpdates = useCallback(async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const { runUpdateCheck, versionLabel } = await import("../../lib/updates");
      const Updates = await import("expo-updates");
      const phase = await runUpdateCheck({
        isDev: __DEV__,
        check: () => Updates.checkForUpdateAsync(),
        fetch: () => Updates.fetchUpdateAsync(),
      });
      if (phase === "ready") {
        showSuccess("Update downloaded — it will apply next time you open the app");
      } else if (phase === "up-to-date") {
        showSuccess("You're on the latest version");
      } else if (phase === "error") {
        showError("Couldn't check — are you online?");
      }
    } catch {
      showError("Version check unavailable");
    } finally {
      setCheckingUpdate(false);
    }
  }, [checkingUpdate]);

  if (!ent) return null;

  // --- Version string (lazy — expo-constants may not be in old builds) ---
  const [version, setVersion] = useState("1.0.0");
  const [currentVersionLabel, setCurrentVersionLabel] = useState("v1.0.0 · embedded");
  useEffect(() => {
    (async () => {
      try {
        const Constants = await import("expo-constants");
        const Updates = await import("expo-updates");
        const { versionLabel } = await import("../../lib/updates");
        const ver = Constants.default.expoConfig?.version ?? "1.0.0";
        setVersion(ver);
        setCurrentVersionLabel(versionLabel(ver, Updates.default.isEmbeddedLaunch ? null : Updates.default.updateId));
      } catch {
        // Keep defaults
      }
    })();
  }, []);

  // Build the Pro subtitle based on cached entitlement + subscription label
  const proSubtitle = ent.pro
    ? subscriptionLabel
      ? `Active · ${subscriptionLabel}`
      : "Active — refresh to see expiry"
    : "Start free trial · ₱199/month after";

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 8 }}>
      <AppHead title="Settings" />

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} className="flex-1" key={reread}>
        <FieldLabel>Account</FieldLabel>
        <SettingsRow
          icon="EnvelopeSimple"
          title={session ? (session.user.email ?? "Signed in") : "Sign in once — inventory stays offline after"}
          subtitle={session ? "Signed in" : "Activate Pro or restore on a new phone"}
          onPress={session ? undefined : () => router.push("/auth/sign-in")}
          chevron={!session}
        />

        <View className="border-b border-hairline py-3.5">
          <SettingsRow
            icon={ent.pro ? "ShieldCheck" : "Package"}
            iconTone={ent.pro ? "acid" : "default"}
            title={ent.pro ? "PRO — Active" : "Free"}
            titleTone={ent.pro ? "acid" : "default"}
            subtitle={proSubtitle}
            last
            noPadding
          />
          {session ? (
            <Pressable hitSlop={8} disabled={refreshing} onPress={() => void refreshLicense()} className="ml-[60px] mt-2 flex-row items-center gap-1.5">
              <Icon name="ArrowsClockwise" size={12} color={COLORS.inkDim} />
              <Text style={{ fontFamily: FONT.semibold, lineHeight: 17 }} className="text-[12.5px] text-inkdim">
                {refreshing ? "Refreshing…" : "Refresh license"}
              </Text>
            </Pressable>
          ) : (
            <Pressable hitSlop={8} onPress={() => router.push("/pro/paywall")} className="ml-[60px] mt-2 flex-row items-center gap-1.5">
              <Icon name="CaretRight" size={12} color={COLORS.inkDim} />
              <Text style={{ fontFamily: FONT.semibold, lineHeight: 17 }} className="text-[12.5px] text-inkdim">
                Start 14-day free trial
              </Text>
            </Pressable>
          )}
        </View>

        <FieldLabel>App</FieldLabel>
        <SettingsRow
          icon="HardDrives"
          title="Storage"
          subtitle={`${usage.count.toLocaleString("en-PH")} photos · ${usage.label} on device`}
          subtitleTnum
        />

        <SettingsRow
          icon="Export"
          title={exporting ? "Exporting…" : "Export backup"}
          subtitle="Save your inventory to a file you can share or restore later"
          onPress={() => void handleExportBackup()}
        />

        <SettingsRow
          icon="Import"
          title={importing ? "Importing…" : "Import backup"}
          subtitle="Restore inventory from a backup file (replaces current data)"
          onPress={() => void handleImportBackup()}
        />

        <SettingsRow
          icon="WifiSlash"
          title="Offline-first"
          subtitle="Inventory, costs & math stay on this phone — only published items go online"
        />

        <SettingsRow
          icon="GearSix"
          title="Version"
          subtitle={currentVersionLabel}
        />

        <SettingsRow
          icon="Download"
          title="Check for updates"
          subtitle={checkingUpdate ? "Checking…" : "Get the latest fixes and features"}
          onPress={() => void checkForUpdates()}
        />

        <SettingsRow
          icon="ArrowsClockwise"
          title="Restore purchases"
          subtitle="Recover Pro if you signed in on a new device"
          onPress={() => void handleRestore()}
          last={!session}
        />

        {session ? (
          <SettingsRow
            icon="SignOut"
            iconTone="danger"
            title="Sign out"
            titleTone="danger"
            subtitle="Your data stays on this phone"
            onPress={() => void signOut()}
            last
          />
        ) : null}
      </ScrollView>

      <Text
        style={{ fontFamily: FONT.text, lineHeight: 16, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        className="pt-3 text-center text-[11.5px] text-inkfaint"
      >
        Latag {version} · Made for the ukay grind
      </Text>
    </View>
  );
}
