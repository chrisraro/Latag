import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import Constants from "expo-constants";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { db } from "../db/client";
import { entitlements } from "../db/schema";
import { supabase } from "../lib/supabase";
import { fetchLicense, applyLicense, clearLicense } from "../lib/license";
import { FREE_LOG_LIMIT, logsRemaining, ensureEntitlements } from "../lib/entitlements";
import { getMediaUsage } from "../lib/storage-usage";
import { showSuccess, showError } from "../lib/toast";
import { FONT } from "../lib/theme";

type Tone = "default" | "acid" | "danger";

function toneClass(tone: Tone | undefined, base: string): string {
  if (tone === "acid") return "text-acid";
  if (tone === "danger") return "text-danger";
  return base;
}

/** One `.set-row` per the settings mockup: 36px icon square, semibold title, faint subtitle. */
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
}: {
  icon: string;
  iconTone?: Tone;
  title: string;
  titleTone?: Tone;
  subtitle?: string;
  subtitleTnum?: boolean;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
}) {
  const Wrapper = (onPress ? Pressable : View) as typeof Pressable;
  return (
    <Wrapper
      onPress={onPress}
      className={`flex-row items-center gap-3 py-3.5 ${last ? "" : "border-b border-hairline"}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-surface2">
        <Text style={{ fontFamily: FONT.semibold }} className={`text-[15px] ${toneClass(iconTone, "text-inkdim")}`}>{icon}</Text>
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
      {chevron ? <Text className="text-[18px] text-inkfaint">›</Text> : null}
    </Wrapper>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2">
          <Text className="text-[18px] text-inkdim">‹</Text>
        </Pressable>
        <Text style={{ fontFamily: FONT.display }} className="flex-1 text-[20px] text-ink">Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        <SettingsRow
          icon="@"
          title={session ? (session.user.email ?? "Signed in") : "Sign in once — Latag runs 100% offline after"}
          subtitle={session ? "Signed in" : "Activate Pro or restore it on a new phone"}
          onPress={session ? undefined : () => router.push("/auth/sign-in")}
          chevron={!session}
        />

        <View className="border-b border-hairline py-3.5">
          <SettingsRow
            icon="★"
            iconTone={ent.pro ? "acid" : "default"}
            title={ent.pro ? "PRO — Active" : `Free — ${FREE_LOG_LIMIT} item logs`}
            titleTone={ent.pro ? "acid" : "default"}
            subtitle={ent.pro ? "Unlimited item logs, works offline forever" : `${remaining} left · Pro unlocks unlimited`}
            last
          />
          {session ? (
            <Pressable hitSlop={8} disabled={refreshing} onPress={() => void refreshLicense()} className="ml-12 mt-1">
              <Text style={{ fontFamily: FONT.semibold }} className="text-[12.5px] text-inkdim">
                {refreshing ? "Refreshing…" : "Refresh license"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <SettingsRow
          icon="▦"
          title="Storage"
          subtitle={`${usage.count.toLocaleString("en-PH")} photos · ${usage.label} on device`}
          subtitleTnum
        />

        <SettingsRow
          icon="✈"
          title="Offline-first"
          subtitle="Inventory, photos & math never leave this phone"
          last={!session}
        />

        {session ? (
          <SettingsRow
            icon="⏻"
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
