import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { db } from "../db/client";
import migrations from "../drizzle/migrations";
import { ensureEntitlements } from "../lib/entitlements";
import { sweepOrphans } from "../lib/media";

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

  useEffect(() => {
    if (migrated) { ensureEntitlements(db); sweepOrphans(db).catch(() => {}); }
  }, [migrated]);
  useEffect(() => { if (migrated && fontsLoaded) SplashScreen.hideAsync(); }, [migrated, fontsLoaded]);
  if (!migrated || !fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }}>
        <Stack.Screen name="session/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="session/[id]/camera" options={{ presentation: "fullScreenModal" }} />
        {/* TODO(task-13): register item/[id]/sold modal once that route exists */}
      </Stack>
    </GestureHandlerRootView>
  );
}
