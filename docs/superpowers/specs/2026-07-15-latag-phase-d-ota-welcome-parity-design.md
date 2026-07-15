# Latag Phase D — OTA Updates, Welcome Screen, Mockup Parity

**Date:** 2026-07-15
**Status:** Approved
**Depends on:** MVP spec (2026-07-13), Platform spec (2026-07-13), Phases A–C shipped

## 1. Goal

Three workstreams, one release train:

1. **D1 — OTA updates**: JS-level fixes ship to installed APKs without rebuilds (expo-updates + EAS Update).
2. **D2 — Welcome screen**: the missing mockup screen #1, adapted to the offline-first freemium reality.
3. **D3 — Design parity**: every app screen matches the production mockups (`docs/mockups/latag-mvp.html`) exactly — spacing, typography, layout rhythm.

The phase ends with **one APK rebuild** (carries the expo-updates native module + the new brand icons). All JS fixes after that rebuild ship OTA.

## 2. D1 — OTA updates

### Config

- Add `expo-updates`; `app.json`: `updates.url = https://u.expo.dev/465e3d82-c739-4bf8-ab14-8cb7869b4535`, `runtimeVersion: { policy: "appVersion" }`, `updates.checkAutomatically: "NEVER"` (JS owns the flow; boot never blocks).
- `eas.json`: `preview` build profile gets `channel: "preview"`.
- Runtime-version policy is the safety line: OTA bundles apply only to APKs with the same native app version. Any native change (new module, icon change, SDK bump) requires a version bump + rebuild; JS-only changes ship OTA.

### Runtime flow (decision: prompt-to-restart)

- On launch, skipped in `__DEV__` and gated so it never delays first paint: `checkForUpdateAsync()` → if available `fetchUpdateAsync()` → success toast **"Update ready — tap to restart"**; tap → `Updates.reloadAsync()`.
- Every failure (offline, timeout, server error) is swallowed silently — same philosophy as the license fetch. Offline boot is untouched (embedded bundle fallback).
- Settings gains an **App** section: version + short update ID, and a **Check for updates** row with honest states: checking → "Up to date" / downloading → "Update ready — tap to restart" / "Couldn't check — are you online?" (error styling).

### Publishing workflow

After a fix batch passes gates: `eas update --channel preview --message "<summary>"`. Installed apps prompt on next launch. Documented in the SDD ledger as the standard ship path post-Phase-D.

## 3. D2 — Welcome screen (mockup #1, adapted)

New route `app/welcome.tsx`, composition per mockup:

- Logo mark (new brand asset) + **LATAG** wordmark (Archivo Expanded Black) + pitch: "Log fast. Know your margins. Work where there's no signal."
- Three feature rows: Two buying modes — Selector & Bulto · 5-second logging, zero typing · 100% offline after activation.
- Primary: **Continue with Email** → existing sign-in flow (OTP/link). On success, continues to onboarding with the standard license toast.
- Secondary: **Start offline — sign in later** → onboarding directly.
- Footer: sign-in is only for Pro licensing; inventory never leaves the phone.

**Deviation from mockup (deliberate):** no "Continue with Google" — Google OAuth is future work (needs Google Cloud + native fingerprint config). No forced sign-in: the mockup's activation-gate flow contradicts the shipped freemium/offline-first model.

**First-run flow:** fresh install → Welcome → Onboarding → Sessions. Flags: `latag.welcomed`, `latag.onboarded` (AsyncStorage, same failure-tolerant pattern as onboarding). Welcome shows only when **neither** flag is set — existing users who already onboarded never see it after updating.

## 4. D3 — Design parity (all screens)

**Canonical spec:** `docs/mockups/latag-mvp.html` — precise CSS; its values are the truth. The landing-page showcase PNGs are renders of the same mockups, so app convergence automatically restores app↔landing consistency.

**Method:**

1. **Extraction**: during planning, read the mockup stylesheet + each screen's markup into a per-screen parity checklist of exact values — screen padding, card padding, inter-element gaps, radii, font sizes/weights/width-stretch, label casing/letter-spacing, hairline usage, tabular-numeral styling.
2. **Primitives first (leverage)**: fix shared components (`components/ui.tsx`, theme tokens, card/label/button primitives) before screens — one fix propagates everywhere; this is the root cause of the reported "text inside cards has no proper spacing".
3. **Per-screen deltas** in six task groups:
   1. First-run: welcome · onboarding (modes, camera) · sign-in/enter-code
   2. Sessions list · empty state (mockup #6) · new-session sheet
   3. Dashboards: Selector · Bulto
   4. Rapid Console · camera capture
   5. Item detail · mark-sold sheet
   6. IG export · settings

**Acceptance per task:** parity checklist fully ticked against the mockup; all tests green; `npx expo export --platform android` clean.

## 5. Sequencing & release

D1 → D2 → D3 (SDD per task, whole-phase review at the end) → **one APK rebuild** → device QA → future fixes via `eas update`.

## 6. Out of scope (future)

- Google OAuth on Welcome.
- New categories beyond tops, added features (to be brainstormed separately — user note 2026-07-15).
- Custom SMTP, payment provider, custom domain (deferred, unchanged).
