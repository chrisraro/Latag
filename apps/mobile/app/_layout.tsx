import "../global.css";
import { useEffect, useRef } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { db } from "../db/client";
import migrations from "../drizzle/migrations";
import { ensureEntitlements } from "../lib/entitlements";
import { sweepOrphans } from "../lib/media";
import { supabase } from "../lib/supabase";
import { completeSignIn } from "../lib/auth-complete";
import { setWelcomed } from "../lib/first-run";
import { runUpdateCheck } from "../lib/updates";
import { ensureAlarmChannel } from "../lib/notifications";
import { showError } from "../lib/toast";
import { AppToast } from "../components/AppToast";

SplashScreen.preventAutoHideAsync();

// Session reminders must still alert (banner + alarm sound) when the app is
// already in the foreground — the default is to silently drop them.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const { success: migrated } = useMigrations(db, migrations);
  const [fontsLoaded] = useFonts({
    Archivo: require("../assets/fonts/Archivo-Regular.ttf"),
    "Archivo-Medium": require("../assets/fonts/Archivo-Medium.ttf"),
    "Archivo-SemiBold": require("../assets/fonts/Archivo-SemiBold.ttf"),
    "Archivo-Bold": require("../assets/fonts/Archivo-Bold.ttf"),
    "ArchivoExpanded-ExtraBold": require("../assets/fonts/ArchivoExpanded-ExtraBold.ttf"),
    "ArchivoExpanded-Black": require("../assets/fonts/ArchivoExpanded-Black.ttf"),
  });
  const url = Linking.useURL();
  const lastHandledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (migrated) { ensureEntitlements(db); sweepOrphans(db).catch(() => {}); }
  }, [migrated]);
  useEffect(() => { if (migrated && fontsLoaded) SplashScreen.hideAsync(); }, [migrated, fontsLoaded]);

  // Deep-link completion (email sign-in link -> latag://auth/callback?code=...).
  // Must never crash offline/no-op use: every failure mode below is swallowed.
  // Gated on `migrated`: a cold launch straight from the email must not race
  // applyLicense against the entitlements table existing.
  useEffect(() => {
    if (!migrated) return;
    if (!url || url === lastHandledUrl.current || !url.includes("code=")) return;
    lastHandledUrl.current = url;
    (async () => {
      try {
        const { queryParams } = Linking.parse(url);
        const code = queryParams?.code;
        if (!code) return;
        const { error } = await supabase.auth.exchangeCodeForSession(String(code));
        if (error) {
          showError("That sign-in link couldn't be used — request a new one or enter the code");
          return;
        }
        const ok = await completeSignIn();
        if (ok) {
          // Mirrors sign-in.tsx's verifyCode routing: land in onboarding for a
          // fresh account, otherwise dismiss whatever sign-in UI is on top
          // (modal or Welcome) so the deep link actually returns the user home.
          await setWelcomed();
          const onboarded = (await AsyncStorage.getItem("latag.onboarded").catch(() => null)) === "1";
          if (!onboarded) router.replace("/onboarding");
          else if (router.canDismiss()) router.dismissAll();
        }
      } catch {
        // Malformed URL / offline / auth client error — no-op.
      }
    })();
  }, [url, migrated]);

  // Session reminders: ensure the Android alarm channel exists, and route a
  // notification tap to its session via the deep-link URL stashed in data.
  useEffect(() => {
    if (!migrated) return;
    void ensureAlarmChannel();
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const url = response.notification.request.content.data?.url;
        if (typeof url === "string") router.push(url as Parameters<typeof router.push>[0]);
      } catch {
        // Malformed notification payload — ignore the tap.
      }
    });
    return () => sub.remove();
  }, [migrated]);

  // OTA: fully silent — download in the background on launch; expo-updates
  // runs the downloaded bundle automatically on the NEXT cold start.
  // Owner decision 2026-07-15: no restart prompt (was prompt-to-restart).
  useEffect(() => {
    if (!migrated) return;
    void runUpdateCheck({
      isDev: __DEV__,
      check: () => Updates.checkForUpdateAsync(),
      fetch: () => Updates.fetchUpdateAsync(),
    });
  }, [migrated]);

  if (!migrated || !fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }}>
        <Stack.Screen name="session/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="session/edit" options={{ presentation: "modal" }} />
        <Stack.Screen name="session/[id]/camera" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="item/[id]/sold" options={{ presentation: "modal" }} />
        <Stack.Screen name="auth/sign-in" options={{ presentation: "modal" }} />
      </Stack>
      <AppToast />
    </GestureHandlerRootView>
  );
}
