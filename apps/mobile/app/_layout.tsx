import "../global.css";
import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { db } from "../db/client";
import migrations from "../drizzle/migrations";
import { ensureEntitlements } from "../lib/entitlements";
import { sweepOrphans } from "../lib/media";
import { supabase } from "../lib/supabase";
import { completeSignIn } from "../lib/auth-complete";
import { AppToast } from "../components/AppToast";

SplashScreen.preventAutoHideAsync();

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
  useEffect(() => {
    if (!url || url === lastHandledUrl.current || !url.includes("code=")) return;
    lastHandledUrl.current = url;
    (async () => {
      try {
        const { queryParams } = Linking.parse(url);
        const code = queryParams?.code;
        if (!code) return;
        const { error } = await supabase.auth.exchangeCodeForSession(String(code));
        if (error) return;
        await completeSignIn();
      } catch {
        // Malformed URL / offline / auth client error — no-op.
      }
    })();
  }, [url]);

  if (!migrated || !fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }}>
        <Stack.Screen name="session/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="session/[id]/camera" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="item/[id]/sold" options={{ presentation: "modal" }} />
        <Stack.Screen name="auth/sign-in" options={{ presentation: "modal" }} />
      </Stack>
      <AppToast />
    </GestureHandlerRootView>
  );
}
