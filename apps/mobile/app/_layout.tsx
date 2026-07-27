import "../global.css";
import { useEffect, useRef, useState } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Text, View } from "react-native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { db } from "../db/client";
import migrations from "../drizzle/migrations";
import { ensureEntitlements } from "../lib/entitlements";
import { sweepOrphans } from "../lib/media";
import { supabase } from "../lib/supabase";
import { completeSignIn } from "../lib/auth-complete";
import { decideStartRoute, setWelcomed } from "../lib/first-run";
import { runUpdateCheck } from "../lib/updates";
import { syncPublishQueue } from "../lib/shop-sync";
import { ensureAlarmChannel, notifResponsePath } from "../lib/notifications";
import { showError } from "../lib/toast";
import { composerAnimation, durationFor, useReducedMotion } from "../lib/motion";
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
  const { success: migrated, error: migrationError } = useMigrations(db, migrations);
  const reduced = useReducedMotion();
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
  const handled = useRef(false); // cold-start launch response — replay at most once

  // First-run gate, hoisted above the tab navigator (was duplicated inside
  // both (tabs)/index.tsx and (tabs)/batches.tsx, which let the floating tab
  // bar flash before the redirect landed on a fresh install). undefined =
  // still reading AsyncStorage; null = fully initialized, stay put.
  const [startRoute, setStartRoute] = useState<string | null | undefined>(undefined);
  const redirected = useRef(false);

  useEffect(() => {
    AsyncStorage.multiGet(["latag.welcomed", "latag.onboarded"])
      .then((pairs) => setStartRoute(decideStartRoute(pairs[0][1] === "1", pairs[1][1] === "1")))
      .catch(() => setStartRoute(null)); // never leave the app permanently blank
  }, []);

  useEffect(() => {
    if (migrated) { ensureEntitlements(db); sweepOrphans(db).catch(() => {}); }
  }, [migrated]);
  useEffect(() => {
    if ((migrated || migrationError) && fontsLoaded && startRoute !== undefined) SplashScreen.hideAsync();
  }, [migrated, migrationError, fontsLoaded, startRoute]);

  useEffect(() => {
    if (startRoute && !redirected.current) {
      redirected.current = true;
      router.replace(startRoute as Parameters<typeof router.replace>[0]);
    }
  }, [startRoute]);

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
  // notification tap to its session by PATH (never the raw scheme-URL) —
  // both the response that launched a cold-started app and any tap received
  // while the app is already running.
  useEffect(() => {
    if (!migrated) return;
    void ensureAlarmChannel();
    const routeNotif = (resp: Notifications.NotificationResponse | null) => {
      const path = notifResponsePath(resp);
      if (path) router.push(path as Parameters<typeof router.push>[0]);
    };
    if (!handled.current) {
      handled.current = true;
      routeNotif(Notifications.getLastNotificationResponse());
    }
    const sub = Notifications.addNotificationResponseReceivedListener(routeNotif);
    return () => sub.remove();
  }, [migrated]);

  // Storefront outbox: drain once on launch and again whenever the app comes
  // back to the foreground (the usual moment connectivity has returned).
  // Fire-and-forget by design — syncPublishQueue never throws, and a failed
  // drain just leaves the rows queued for the next pass.
  useEffect(() => {
    if (!migrated) return;
    void syncPublishQueue(db);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncPublishQueue(db);
    });
    return () => sub.remove();
  }, [migrated]);

  // OTA: fully silent — download in the background on launch; expo-updates
  // runs the downloaded bundle automatically on the NEXT cold start.
  // Owner decision 2026-07-15: no restart prompt (was prompt-to-restart).
  //
  // DELIBERATELY NOT gated on `migrated`, and deliberately the first effect
  // that runs. This is the app's only remote repair path: `checkAutomatically`
  // is "NEVER", so nothing fetches an update except this call. On 2026-07-27 a
  // bad bundle crashed before reaching the equivalent line and the phone could
  // not pull its own fix — recovery needed a republished update and several
  // launches. A failed migration would stick the render at `null` forever;
  // gating this on that success would make the failure permanent. Running it
  // unconditionally means a broken build can always be replaced remotely.
  useEffect(() => {
    void runUpdateCheck({
      isDev: __DEV__,
      check: () => Updates.checkForUpdateAsync(),
      fetch: () => Updates.fetchUpdateAsync(),
    });
  }, []);

  // A migration that throws used to render `null` forever: no splash dismissal,
  // no screen, no explanation, and (before the update check was ungated above)
  // no way for a fix to arrive. Migration 0005 rebuilds the whole `items`
  // table on a phone holding real stock, so this branch is not hypothetical.
  // Deliberately plain RN with literal styles — no NativeWind, no loaded
  // fonts, no theme import — because whatever just failed, this must render.
  if (migrationError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", padding: 24, justifyContent: "center" }}>
        <Text style={{ color: "#F2F2F2", fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
          Latag could not open your database
        </Text>
        <Text style={{ color: "#ADADAD", fontSize: 14, lineHeight: 20 }}>
          Your items are still on this phone — nothing has been deleted. Do not uninstall the app or
          clear its storage, as that would erase them. Keep the app installed and open it again
          later; an update that fixes this will download on its own.
        </Text>
        <Text style={{ color: "#8A8A8A", fontSize: 12, lineHeight: 17, marginTop: 16 }}>
          {String(migrationError.message ?? migrationError)}
        </Text>
      </View>
    );
  }

  if (!migrated || !fontsLoaded || startRoute === undefined) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* The other half of the FAB → composer transition: the quick-add button
            sits at the bottom of the screen, so the composer it summons rises
            from there. Not a modal — the Rapid Console is a full screen you can
            navigate onward from — so the motion is what tells you where it came
            from. Reduced motion makes it a cut, and either way the composer is
            interactive the moment it mounts. */}
        <Stack.Screen
          name="item/new/index"
          options={{ animation: composerAnimation(reduced), animationDuration: durationFor("screen", reduced) }}
        />
        <Stack.Screen name="session/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="session/edit" options={{ presentation: "modal" }} />
        <Stack.Screen name="session/[id]/camera" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="item/[id]/sold" options={{ presentation: "modal" }} />
        <Stack.Screen name="shop/setup" options={{ presentation: "modal" }} />
        <Stack.Screen name="auth/sign-in" options={{ presentation: "modal" }} />
      </Stack>
      <AppToast />
    </GestureHandlerRootView>
  );
}
