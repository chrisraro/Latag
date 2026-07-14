# Latag Mobile Licensing Phase C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Checkbox steps. TDD mandatory for every `lib/` module.

**Goal:** Wire the mobile app to the B2 backend: sign-in (emailed deep link now, 6-digit code when SMTP lands), license fetch + local caching (permanent offline Pro), the Settings screen, and the first-run onboarding screens — completing "every designed screen works frontend-to-backend."

**Architecture:**
- **Offline-first is untouched:** the app still makes ZERO network calls for inventory features. Supabase/auth code runs only in the sign-in flow, the license fetch, and sign-out. Airplane-mode QA must still pass end-to-end.
- **Auth:** supabase-js (PKCE) with AsyncStorage session persistence (official Expo pattern). Sign-in entry points: Settings and the Go Pro sheet — the app never gates on an account (free tier works signed-out; the Welcome mockup becomes the signed-out state of Settings' account section, not a launch wall).
- **License caching:** `GET https://latag.vercel.app/api/license` with the Supabase access token → on 200, store `{ pro: true, licenseReceipt }` in the local `entitlements` row. **Deliberate decision (record):** the receipt is cached as an opaque server-verifiable token; the app does NOT cryptographically verify it on-device — HMAC verification would require shipping the signing secret (forgeable), and any local check shares the trust level of the local DB anyway. If real tamper-resistance is ever wanted, that's an Ed25519 receipt v2 (`latag2.`) — out of scope.
- **404 semantics (deliberate):** a 404 from /api/license while signed in means no active license → clear `pro` + receipt (revoke propagates on next refresh). Network errors change nothing (offline-first: cached Pro survives forever).

**Tech Stack:** @supabase/supabase-js (RN) · @react-native-async-storage/async-storage · react-native-url-polyfill · expo-linking (deep link) · existing jest harness (better-sqlite3 for entitlements logic; fetch mocked for license client)

## Global Constraints

- Facts: Supabase URL `https://dcnpuvtbftpbcjcvfnlt.supabase.co`; anon key = the public value in `apps/web/.env.example`; API base `https://latag.vercel.app`; app scheme `latag` (app.json); receipt golden vector pinned in `apps/web/tests/licensing.test.ts` (format `latag1.<b64url>.<b64url>` — mobile treats it as opaque).
- Mobile env via `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in a committed `apps/mobile/.env` (anon key is public by design). Never any service key or signing secret in mobile.
- Design system: existing tokens/components (Chip, PrimaryButton, SecondaryButton, FieldLabel, Wheel, AppToast/showSuccess/showError, GoProSheet); Archivo voices; haptics vocabulary; ≥44px targets; sheets pattern; screens match the approved mockups (Welcome copy → Settings account card; Email-code screen; Settings; Onboarding ×2).
- All DB writes through `lib/repo.ts`-style helpers; entitlements changes via a new `lib/license.ts` (TDD). No Redux.
- Supabase client: PKCE flow, `detectSessionInUrl: false`, AsyncStorage storage, `autoRefreshToken: true` — and token refresh failures must NEVER crash offline use (auth module is lazy-imported by auth screens only where feasible).
- Gates per task: `pnpm -C apps/mobile test` green (32 base + new), `pnpm typecheck` 0, `npx expo export --platform android` succeeds (bundling gate). Commit per task. `.superpowers/`, `.env.local` never committed (mobile `.env` with EXPO_PUBLIC_* IS committed).
- Sign-in UX truth: primary copy says "tap the link we emailed you"; code boxes remain functional for post-SMTP. After session established: fetch license, applyLicense, success toast, navigate back.

**File structure (new):**
```
apps/mobile/.env                          EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
apps/mobile/lib/supabase.ts               client (PKCE, AsyncStorage)
apps/mobile/lib/license.ts                fetchLicense + applyLicense + clearLicense (TDD)
apps/mobile/lib/storage-usage.ts          photo count + bytes (pure part TDD)
apps/mobile/app/auth/sign-in.tsx          email → link-or-code screen (modal)
apps/mobile/app/settings.tsx              Settings screen
apps/mobile/app/onboarding.tsx            2-pane first-run (modes, camera/privacy)
tests: license.test.ts, storage-usage.test.ts
Modified: app/_layout.tsx (deep-link handler, onboarding gate, settings modal reg)
          app/index.tsx (gear button → /settings)
          components/GoProSheet.tsx ("Already Pro? Sign in" affordance)
          db/schema + migration NOT needed (entitlements table already has pro + license_receipt)
```

---

### Task C1: Deps, env, supabase client

**Files:** Create `apps/mobile/.env`, `apps/mobile/lib/supabase.ts`; modify `apps/mobile/package.json` (deps)

- [ ] Install: `pnpm -C apps/mobile exec npx expo install @react-native-async-storage/async-storage` and `pnpm -C apps/mobile add @supabase/supabase-js react-native-url-polyfill`.
- [ ] `apps/mobile/.env` (committed — public values only):
```
EXPO_PUBLIC_SUPABASE_URL=https://dcnpuvtbftpbcjcvfnlt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key from apps/web/.env.example, copied verbatim>
```
- [ ] `apps/mobile/lib/supabase.ts`:
```ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/** Auth-only client. Inventory NEVER touches this — offline-first is law. */
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
```
- [ ] Gates (expo export bundling gate matters here — supabase-js in Metro). Commit: `feat(mobile): supabase auth client + env`

### Task C2: `lib/license.ts` (strict TDD)

**Interfaces:**
- `applyLicense(db, input: { receipt: string }): void` — sets `entitlements` row id=1: `pro: true, licenseReceipt: input.receipt`.
- `clearLicense(db): void` — `pro: false, licenseReceipt: null` (logsUsed untouched — free counter resumes).
- `fetchLicense(accessToken: string, fetchImpl?: typeof fetch): Promise<{ kind: "pro"; receipt: string } | { kind: "none" } | { kind: "error" }>` — GET `https://latag.vercel.app/api/license` with Bearer; 200→pro (require non-empty `receipt` string and `license.status === "active"`), 404→none, anything else / thrown fetch → error. NEVER throws.
- Tests (better-sqlite3 harness + mocked fetchImpl): apply→row updated + consumeLog returns Infinity after; clear→free counter resumes at previous logsUsed; fetch 200/404/500/network-throw table.

- [ ] RED (write all tests, run, fail) → GREEN → gates → commit: `feat(mobile): license fetch + local cache (TDD)`

### Task C3: Sign-in screen + deep-link completion + Go Pro affordance

**Files:** Create `apps/mobile/app/auth/sign-in.tsx`; modify `app/_layout.tsx`, `components/GoProSheet.tsx`

- [ ] `sign-in.tsx` (modal, mirrors the approved Email-code mockup + link-first copy): email field (the app's third sanctioned text input — auth scope) → "Send link + code" primary → step 2: "Tap the sign-in link we emailed to <email> — or enter the code below if your email shows one." + 6-digit code input (numeric, one-time-code autocomplete) + Verify + Resend + different-email. Code path: `supabase.auth.verifyOtp({ email, token, type: "email" })`. On session (either path): `const { data: { session } } = await supabase.auth.getSession(); const res = await fetchLicense(session.access_token);` → `pro` → `applyLicense` + success toast "Pro activated — yours forever, even offline"; `none` → toast "Signed in — no Pro license on this account yet"; `error` → toast "Signed in — couldn't check license (offline?), will retry next time". Then `router.back()`.
- [ ] Deep link: in `_layout.tsx`, `Linking.useURL()`-based effect (expo-linking): when a URL arrives containing `code=`, call `supabase.auth.exchangeCodeForSession(code)` then run the same license-fetch/apply/toast sequence. `requestOtp` equivalent on mobile: `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: "latag://auth/callback" } })`. Add `latag://auth/callback`… wait — Supabase allow-list must include the scheme: controller will add `latag://**` to uri_allow_list via management API (controller step, noted).
- [ ] GoProSheet: under the latag.vercel.app/pro line add a SecondaryButton "Already Pro? Sign in" → closes sheet, routes to /auth/sign-in.
- [ ] Register modal in _layout Stack. Gates + export. Commit: `feat(mobile): sign-in via emailed link or code, license activation`

### Task C4: Settings screen + storage usage

**Files:** Create `apps/mobile/app/settings.tsx`, `apps/mobile/lib/storage-usage.ts`; modify `app/index.tsx` (gear entry)

- [ ] `storage-usage.ts`: `summarizeUsage(sizes: number[]): { count: number; bytes: number; label: string }` (pure, TDD — label like `"312 MB"` / `"48 KB"`, 1 decimal max) + `getMediaUsage()` reading latag_media/ via FileSystem (device-only path, not unit-tested).
- [ ] `settings.tsx` per mockup 15: Account card — signed-out: Welcome-mockup copy ("Sign in once — Latag runs 100% offline after") + "Sign in" primary → /auth/sign-in; signed-in: email + license status (PRO badge acid / Free) + "Refresh license" (re-runs fetchLicense flow) + "Sign out" (supabase.auth.signOut(); NOTE: does NOT clear local Pro — deliberate: license stays cached per offline-first; copy says so). Storage row (count + label via getMediaUsage). Offline-first info row. About row (version via expo-constants). NO telemetry toggle yet (backend doesn't exist — deferred Phase D; leave out entirely rather than a dead switch).
- [ ] `index.tsx` header: small gear Pressable (44px) → router.push("/settings").
- [ ] Gates + export. Commit: `feat(mobile): settings screen with account, license, storage`

### Task C5: First-run onboarding

**Files:** Create `apps/mobile/app/onboarding.tsx`; modify `app/_layout.tsx` or `app/index.tsx` (gate)

- [ ] Two-pane pager per mockups 3–4 (modes explainer: Selector/Bulto cards; camera/privacy: 4 slots visual + "Photos stay on your phone" card + Continue → camera permission is NOT requested here — the console asks contextually; button just advances). Skip affordance. AsyncStorage flag `latag.onboarded = "1"`; on first app open (flag absent) `index.tsx` redirects once to /onboarding; Done/Skip sets flag → replace to "/".
- [ ] Gates + export. Commit: `feat(mobile): first-run onboarding`

### Task C6: Final gate + QA + docs

- [ ] Full: mobile suite green (32 + new), mobile tsc 0, `expo export` ok, web suite 9/9 untouched.
- [ ] Append to `docs/qa/mobile-mvp-checklist.md` a "Phase C" section: sign-in via emailed link on device (deep link opens app, Pro activates after admin grant), airplane-mode STILL fully functional signed-out AND signed-in, cached Pro survives offline relaunch, revoke + refresh license → Free, sign out keeps Pro cached, onboarding shows exactly once, settings storage figure sanity.
- [ ] Spec build-order §6 item 3: mark C shipped (with SMTP-deferred note: code-entry live but emails carry links until custom SMTP).
- [ ] Commit: `chore(mobile): Phase C QA + spec update — C complete`

## Self-Review (performed)
- Spec §2 licensing flow ✓ (C2/C3: fetch→cache→offline-forever; no phone-home). §6 Phase C ✓ (sign-in, receipt caching; counter reconciliation deferred-documented: with Pro the counter is moot; server-side free-count needs telemetry, Phase D). Mockup screens: Welcome→Settings account card (documented reinterpretation — app never gates), Email-code ✓ C3, Settings ✓ C4, Onboarding ✓ C5.
- Placeholders: none. Types consistent (fetchLicense result union used verbatim in C3; applyLicense/clearLicense signatures fixed).
- Deliberate decisions recorded: no on-device receipt crypto (HMAC unverifiable without shipping the secret); 404 clears license; network error preserves cache; sign-out preserves cached Pro.
