import { Redirect } from "expo-router";

/**
 * Deep-link landing for latag://auth/callback?code=... — the root layout's
 * effect owns the actual code exchange; this route only prevents Expo
 * Router's Unmatched Route screen and sends the user home (the index gate
 * still routes first-run users to onboarding).
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
