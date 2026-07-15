import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Welcome shows only for genuinely fresh installs. Users who onboarded
 * before the welcome screen existed (onboarded && !welcomed) must never
 * see it after an update — onboarded wins.
 */
export function decideStartRoute(welcomed: boolean, onboarded: boolean): "/welcome" | "/onboarding" | null {
  if (onboarded) return null;
  return welcomed ? "/onboarding" : "/welcome";
}

/** Marks welcome as seen. Failure-tolerant: worst case, welcome shows again. */
export async function setWelcomed(): Promise<void> {
  await AsyncStorage.setItem("latag.welcomed", "1").catch(() => {});
}
