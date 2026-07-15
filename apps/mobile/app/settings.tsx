import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { db } from "../db/client";
import { entitlements } from "../db/schema";
import { supabase } from "../lib/supabase";
import { fetchLicense, applyLicense, clearLicense } from "../lib/license";
import { FREE_LOG_LIMIT, logsRemaining, ensureEntitlements } from "../lib/entitlements";
import { getMediaUsage } from "../lib/storage-usage";
import { showSuccess, showError } from "../lib/toast";
import { runUpdateCheck, versionLabel } from "../lib/updates";
import { FONT, COLORS } from "../lib/theme";
import { FieldLabel } from "../components/ui";
import { AppHead } from "../components/AppHead";
import { Icon, type IconName } from "../components/Icon";

type Tone = "default" | "acid" | "danger";

function toneClass(tone: Tone | undefined, base: string): string {
  if (tone === "acid") return "text-acid";
  if (tone === "danger") return "text-danger";
  return base;
}

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
  /** Suppress the row's own vertical padding — for callers that wrap the row
   * (plus extra content, e.g. a link below it) in their own padded/bordered
   * container, so the two don't stack into double padding. */
  noPadding?: boolean;
}) {
  const Wrapper = (onPress ? Pressable : View) as typeof Pressable;
  return (
    <Wrapper
      onPress={onPress}
      className={`flex-row items-center gap-3 ${noPadding ? "" : "py-3.5"} ${last ? "" : "border-b border-hairline"}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-surface2">
        <Icon name={icon} size={18} color={toneColor(iconTone)} />
      </View>
      <View className="flex-1">
        <Text style={{ fontFamily: FONT.semibold }} className={`text-[15px] ${toneClass(titleTone, "text-ink")}`} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text
            style={{ fontFamily: FONT.text, fontVariant: subtitleTnum ? ["tabular-nums"] : undefined }}
            className="mt-0.5 text-[12px] text-inkfaint"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {chevron ? <Icon name="CaretRight" size={16} color={COLORS.inkFaint} /> : null}
    </Wrapper>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [usage, setUsage] = useState({ count: 0, bytes: 0, label: "0 B" });
  const { data: entRows } = useLiveQuery(db.select().from(entitlements), []);
  const ent = entRows?.[0] ?? ensureEntitlements(db);

  // Keep the account row fresh across sign-in/out without a manual poll — the
  // initial getSession() covers a cold mount, onAuthStateChange covers changes
  // made elsewhere (e.g. the sign-in screen) while Settings stays mounted.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    getMediaUsage().then(setUsage);
  }, []);

  // Mirrors completeSignIn's three-branch license handling (lib/auth-complete.ts)
  // minus the navigation — this is a manual refresh, not a post-sign-in step.
  const refreshLicense = useCallback(async () => {
    if (refreshing || !session) return;
    setRefreshing(true);
    try {
      // Always resolve a fresh session here rather than trusting the token in
      // component state — getSession() transparently refreshes an expired
      // access token, so a manual refresh tap can't fail on a stale token.
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();
      if (!freshSession) {
        showError("Sign in first to check your license");
        return;
      }
      const res = await fetchLicense(freshSession.access_token);
      if (res.kind === "pro") {
        applyLicense(db, { receipt: res.receipt });
        showSuccess("Pro activated — yours forever, even offline");
      } else if (res.kind === "none") {
        clearLicense(db);
        showSuccess("No Pro license on this account");
      } else {
        showError("Couldn't check license — check your connection and try again");
      }
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, session]);

  // Manual check mirrors the launch effect's state machine but always toasts
  // its outcome — launch is silent-by-design, a manual tap is a deliberate
  // question that deserves an honest answer either way.
  const checkForUpdates = useCallback(async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const phase = await runUpdateCheck({
        isDev: __DEV__,
        check: () => Updates.checkForUpdateAsync(),
        fetch: () => Updates.fetchUpdateAsync(),
      });
      if (phase === "ready") {
        showSuccess("Update ready — tap here to restart", {
          sticky: true,
          onPress: () => { Updates.reloadAsync().catch(() => {}); },
        });
      } else if (phase === "up-to-date") {
        showSuccess("You're on the latest version");
      } else if (phase === "error") {
        showError("Couldn't check — are you online?");
      }
    } finally {
      setCheckingUpdate(false);
    }
  }, [checkingUpdate]);

  const signOut = async () => {
    // Deliberately does NOT clearLicense — Pro stays cached on this phone
    // per offline-first; the toast copy carries that promise.
    const { error } = await supabase.auth.signOut();
    if (error) {
      showError("Couldn't sign out — check your connection and try again");
      return;
    }
    showSuccess("Signed out — your data and Pro stay on this phone");
  };

  const remaining = logsRemaining(ent);
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const currentVersionLabel = versionLabel(version, Updates.updateId);

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <AppHead title="Settings" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        <FieldLabel>Account</FieldLabel>
        <SettingsRow
          icon="EnvelopeSimple"
          title={session ? (session.user.email ?? "Signed in") : "Sign in once — Latag runs 100% offline after"}
          subtitle={session ? "Signed in" : "Activate Pro or restore it on a new phone"}
          onPress={session ? undefined : () => router.push("/auth/sign-in")}
          chevron={!session}
        />

        <View className="border-b border-hairline py-3.5">
          <SettingsRow
            icon={ent.pro ? "ShieldCheck" : "Package"}
            iconTone={ent.pro ? "acid" : "default"}
            title={ent.pro ? "PRO — Active" : `Free — ${FREE_LOG_LIMIT} item logs`}
            titleTone={ent.pro ? "acid" : "default"}
            subtitle={ent.pro ? "Unlimited item logs, works offline forever" : `${remaining} left · Pro unlocks unlimited`}
            last
            noPadding
          />
          {session ? (
            <Pressable hitSlop={8} disabled={refreshing} onPress={() => void refreshLicense()} className="ml-12 mt-1 flex-row items-center gap-1">
              <Icon name="ArrowsClockwise" size={12} color={COLORS.inkDim} />
              <Text style={{ fontFamily: FONT.semibold }} className="text-[12.5px] text-inkdim">
                {refreshing ? "Refreshing…" : "Refresh license"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <FieldLabel>App</FieldLabel>
        <SettingsRow
          icon="HardDrives"
          title="Storage"
          subtitle={`${usage.count.toLocaleString("en-PH")} photos · ${usage.label} on device`}
          subtitleTnum
        />

        <SettingsRow
          icon="WifiSlash"
          title="Offline-first"
          subtitle="Inventory, photos & math never leave this phone"
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
          last={!session}
        />

        {session ? (
          <SettingsRow
            icon="SignOut"
            iconTone="danger"
            title="Sign out"
            titleTone="danger"
            subtitle="Your data and Pro stay on this phone"
            onPress={() => void signOut()}
            last
          />
        ) : null}
      </ScrollView>

      <Text style={{ fontFamily: FONT.text }} className="pb-4 pt-2 text-center text-[11.5px] text-inkfaint">
        Latag {version} · Made for the ukay grind
      </Text>
    </View>
  );
}
