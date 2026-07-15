# Phase D — OTA Updates, Welcome Screen, Mockup Parity: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship OTA update capability, the missing Welcome screen, and exact design parity between the Expo app and the production mockups.

**Architecture:** D1 wires expo-updates (JS-driven, prompt-to-restart). D2 adds `app/welcome.tsx` behind a first-run gate. D3 first lands the icon foundation (react-native-svg + phosphor-react-native) and primitive fixes in `components/ui.tsx` (leverage), then per-screen parity in five groups, each driven by an exact-values checklist extracted from `docs/mockups/latag-mvp.html`.

**Tech Stack:** Expo SDK 57 (RN 0.86), expo-updates + EAS Update, phosphor-react-native + react-native-svg, NativeWind 4, jest-expo.

## Global Constraints

- **Offline-first invariant:** network code is allowed ONLY in: `lib/supabase.ts`, `lib/license.ts`, `lib/auth-complete.ts`, `app/auth/sign-in.tsx`, `app/settings.tsx`, `app/_layout.tsx`, and (new, D1) `lib/updates.ts`. Every network failure is swallowed or surfaced as a toast — never a crash, never a blocked boot.
- **pnpm isolated-layout rule (hard lesson):** every package referenced by app code, `babel.config.js`, or `metro.config.js` MUST be declared in `apps/mobile/package.json`. Transitive resolution works locally (hoisted) but FAILS on EAS.
- **Expo SDK 57 docs:** read https://docs.expo.dev/versions/v57.0.0/ for any API you touch (per apps/mobile/AGENTS.md).
- **Design tokens (never hardcode others):** bg #000000 · surface1 #111111 · surface2 #1A1A1A · hairline #262626 · ink #F2F2F2 · inkdim #ADADAD · inkfaint #8A8A8A · acid #B8F135 · acidink #141A05 · danger #FF5A3C. Fonts: `FONT.text/medium/semibold/bold` (Archivo 400/500/600/700), `FONT.display` (ArchivoExpanded-ExtraBold ≈ mockup weight 800 + stretch 118–125%), `FONT.displayBlack` (ArchivoExpanded-Black ≈ 900/125%).
- **Parity source of truth:** `docs/mockups/latag-mvp.html`. CSS lives at lines 2–230; screen markup: №1 Welcome 285–305 · №2 Email code 307–324 · №3 Onboarding modes 326–347 · №4 Onboarding camera 348–377 · №5 Sessions 378–414 · №6 Sessions empty 415–437 · №7 New session 438–467 · №8 Dashboard Selector 468–507 · №9 Dashboard Bulto 508–542 · №10 Rapid Console 543–582 · №11 Camera 583–606 · №12 Item detail 607–636 · №13 Mark sold 637–661 · №14 IG export 662–699 · №15 Settings 700–741. **Warning:** the file contains a ~120KB base64 font line — never Read it whole; use offset/limit around the line ranges above, or `awk 'NR>=X && NR<=Y'`.
- **Gate per task:** `pnpm test` green (54+ suites grow, never shrink) · `npx tsc --noEmit` clean · commit. Tasks that touch bundling config or add native modules also run `npx expo export --platform android` (delete `dist/` after).
- **Working dir:** all commands from `apps/mobile/` unless stated. Repo root: `C:\Users\raroc\OneDrive\Desktop\Personal Project\Latag` (quote the space).
- Commit style: `feat(mobile): ...` / `fix(mobile): ...`, small and frequent.

---

### Task 1: expo-updates module + channel config

**Files:**
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/eas.json`
- Modify: `apps/mobile/package.json` (via expo install)

**Interfaces:**
- Produces: expo-updates installed and configured; channels `preview`/`production`; runtime version = app version. Task 2 builds the runtime flow on top.

- [ ] **Step 1: Install expo-updates**

Run: `npx expo install expo-updates`
Expected: adds `"expo-updates": "~29.x"` (SDK 57 aligned) to dependencies.

- [ ] **Step 2: Configure app.json**

Add inside `"expo"` (sibling of `"icon"`):

```json
"runtimeVersion": { "policy": "appVersion" },
"updates": {
  "url": "https://u.expo.dev/465e3d82-c739-4bf8-ab14-8cb7869b4535",
  "checkAutomatically": "NEVER",
  "fallbackToCacheTimeout": 0
}
```

- [ ] **Step 3: Add channels to eas.json**

In `"build"`, add `"channel": "preview"` to the `preview` profile and `"channel": "production"` to the `production` profile.

- [ ] **Step 4: Gate**

Run: `pnpm test` (all pass), `npx tsc --noEmit` (clean), `npx expo export --platform android` (succeeds — proves the babel/metro chain still resolves; delete `dist/`).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.json apps/mobile/eas.json apps/mobile/package.json ../../pnpm-lock.yaml
git commit -m "feat(mobile): expo-updates module + preview/production update channels"
```

---

### Task 2: Update runtime — check/fetch state machine, launch hook, Settings row

**Files:**
- Create: `apps/mobile/lib/updates.ts`
- Create: `apps/mobile/tests/updates.test.ts`
- Modify: `apps/mobile/app/_layout.tsx` (launch hook)
- Modify: `apps/mobile/app/settings.tsx` (App section)

**Interfaces:**
- Consumes: `showSuccess/showError` from `lib/toast`; `expo-updates` API.
- Produces: `runUpdateCheck(deps): Promise<UpdatePhase>` and type `UpdatePhase = "dev-skip" | "up-to-date" | "ready" | "error"`. `deps = { isDev: boolean; check: () => Promise<{ isAvailable: boolean }>; fetch: () => Promise<{ isNew: boolean }> }`. Settings shows `versionLabel(version, updateId)`.

- [ ] **Step 1: Write failing tests**

```ts
// apps/mobile/tests/updates.test.ts
import { runUpdateCheck, versionLabel } from "../lib/updates";

const ok = { isAvailable: true };
const none = { isAvailable: false };

describe("runUpdateCheck", () => {
  test("dev builds skip entirely", async () => {
    const check = jest.fn();
    expect(await runUpdateCheck({ isDev: true, check, fetch: jest.fn() })).toBe("dev-skip");
    expect(check).not.toHaveBeenCalled();
  });
  test("no update available -> up-to-date, no fetch", async () => {
    const fetch = jest.fn();
    expect(await runUpdateCheck({ isDev: false, check: async () => none, fetch })).toBe("up-to-date");
    expect(fetch).not.toHaveBeenCalled();
  });
  test("update available and fetched -> ready", async () => {
    expect(await runUpdateCheck({ isDev: false, check: async () => ok, fetch: async () => ({ isNew: true }) })).toBe("ready");
  });
  test("available but fetch returns stale -> up-to-date", async () => {
    expect(await runUpdateCheck({ isDev: false, check: async () => ok, fetch: async () => ({ isNew: false }) })).toBe("up-to-date");
  });
  test("check throws (offline) -> error, never rejects", async () => {
    expect(await runUpdateCheck({ isDev: false, check: async () => { throw new Error("net"); }, fetch: jest.fn() })).toBe("error");
  });
  test("fetch throws -> error", async () => {
    expect(await runUpdateCheck({ isDev: false, check: async () => ok, fetch: async () => { throw new Error("net"); } })).toBe("error");
  });
});

describe("versionLabel", () => {
  test("version with update id -> 'v1.0.0 · a1b2c3d4'", () => {
    expect(versionLabel("1.0.0", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe("v1.0.0 · a1b2c3d4");
  });
  test("embedded build (no update id) -> 'v1.0.0 · embedded'", () => {
    expect(versionLabel("1.0.0", null)).toBe("v1.0.0 · embedded");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test tests/updates.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement lib/updates.ts**

```ts
// apps/mobile/lib/updates.ts
export type UpdatePhase = "dev-skip" | "up-to-date" | "ready" | "error";

type Deps = {
  isDev: boolean;
  check: () => Promise<{ isAvailable: boolean }>;
  fetch: () => Promise<{ isNew: boolean }>;
};

/**
 * OTA check/fetch as a pure-ish state machine so the decision logic is
 * unit-testable without the native module. Never throws: offline/CDN
 * failures resolve to "error" and the caller decides whether to surface it
 * (silent on launch, toast on manual check).
 */
export async function runUpdateCheck({ isDev, check, fetch }: Deps): Promise<UpdatePhase> {
  if (isDev) return "dev-skip";
  try {
    const { isAvailable } = await check();
    if (!isAvailable) return "up-to-date";
    const { isNew } = await fetch();
    return isNew ? "ready" : "up-to-date";
  } catch {
    return "error";
  }
}

/** "v1.0.0 · a1b2c3d4" — short update id, or "embedded" for the built-in bundle. */
export function versionLabel(version: string, updateId: string | null | undefined): string {
  return `v${version} · ${updateId ? updateId.slice(0, 8) : "embedded"}`;
}
```

- [ ] **Step 4: Verify pass** — `pnpm test tests/updates.test.ts` → PASS.

- [ ] **Step 5: Launch hook in _layout.tsx**

After the existing deep-link effect, add (imports: `* as Updates from "expo-updates"`, `runUpdateCheck` from `../lib/updates`, plus existing toast import):

```tsx
// OTA: silent check on launch; prompt-to-restart when a new bundle is ready.
useEffect(() => {
  if (!migrated) return;
  void runUpdateCheck({
    isDev: __DEV__,
    check: () => Updates.checkForUpdateAsync(),
    fetch: () => Updates.fetchUpdateAsync(),
  }).then((phase) => {
    if (phase === "ready") {
      showSuccess("Update ready — tap here to restart", { onPress: () => { void Updates.reloadAsync(); } });
    }
    // up-to-date / error / dev-skip: silent on launch by design.
  });
}, [migrated]);
```

If `showSuccess` doesn't accept an options argument yet, extend `lib/toast.ts` so both `showSuccess(msg, opts?: { onPress?: () => void })` and `showError` forward `onPress` to `Toast.show({ ..., onPress })` — react-native-toast-message supports `onPress` natively. Keep existing call sites source-compatible.

- [ ] **Step 6: Settings App section**

In `app/settings.tsx`, add an **App** section (pattern-match the existing section styling; final visual spec lands in Task 11):
- Row 1: label "Version", value `versionLabel(Constants.expoConfig?.version ?? "1.0.0", Updates.updateId)` (import `Constants` from `expo-constants`, `* as Updates from "expo-updates"`).
- Row 2: "Check for updates" pressable with local state: idle → "Checking…" → phase: `ready` → success toast "Update ready — tap here to restart" (same onPress reload); `up-to-date` → success toast "You're on the latest version"; `error` → error toast "Couldn't check — are you online?". Double-tap guard like `refreshing`.

- [ ] **Step 7: Gate + commit**

`pnpm test` all green · `npx tsc --noEmit` · `npx expo export --platform android` ok.

```bash
git add apps/mobile/lib/updates.ts apps/mobile/tests/updates.test.ts apps/mobile/app/_layout.tsx apps/mobile/app/settings.tsx apps/mobile/lib/toast.ts
git commit -m "feat(mobile): OTA update flow — launch check, restart prompt, settings version + manual check"
```

---

### Task 3: Icon foundation — react-native-svg + phosphor-react-native

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/components/Icon.tsx`
- Create: `apps/mobile/tests/icon.test.tsx`

**Interfaces:**
- Produces: `<Icon name="CaretLeft" size={18} color={COLORS.inkDim} />` — `name` is a typed union; default weight **bold** (mockups use Phosphor Bold), default color `COLORS.ink`. Names needed by later tasks: `CaretLeft, CaretRight, CaretDown, Plus, Check, X, Camera, ClipboardText, PencilSimple, Trash, MagnifyingGlass, GearSix, SignOut, WifiSlash, HardDrives, ShieldCheck, Package, Target, EnvelopeSimple, ArrowsClockwise, Download`.

- [ ] **Step 1: Install** — `npx expo install react-native-svg` then `pnpm add phosphor-react-native`. Both land in `apps/mobile/package.json` (isolated-layout rule).

- [ ] **Step 2: Failing test**

```tsx
// apps/mobile/tests/icon.test.tsx
import { render } from "@testing-library/react-native"; // if not present: renderer from "react-test-renderer"
import { Icon } from "../components/Icon";

test("renders a phosphor icon without crashing and passes size", () => {
  const tree = render(<Icon name="Camera" size={20} />);
  expect(tree.toJSON()).toBeTruthy();
});
test("unknown names are a type error (compile-time) — runtime falls back to null", () => {
  // @ts-expect-error invalid name
  const tree = render(<Icon name="NotARealIcon" />);
  expect(tree.toJSON()).toBeNull();
});
```

If `@testing-library/react-native` isn't installed, use `react-test-renderer` (`renderer.create(...)`) — do NOT add new test libraries.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/components/Icon.tsx
import {
  CaretLeft, CaretRight, CaretDown, Plus, Check, X, Camera, ClipboardText,
  PencilSimple, Trash, MagnifyingGlass, GearSix, SignOut, WifiSlash,
  HardDrives, ShieldCheck, Package, Target, EnvelopeSimple, ArrowsClockwise, Download,
} from "phosphor-react-native";
import { COLORS } from "../lib/theme";

const ICONS = {
  CaretLeft, CaretRight, CaretDown, Plus, Check, X, Camera, ClipboardText,
  PencilSimple, Trash, MagnifyingGlass, GearSix, SignOut, WifiSlash,
  HardDrives, ShieldCheck, Package, Target, EnvelopeSimple, ArrowsClockwise, Download,
} as const;

export type IconName = keyof typeof ICONS;

/** Phosphor Bold is the app's icon voice (mockup parity). */
export function Icon({ name, size = 18, color = COLORS.ink }: { name: IconName; size?: number; color?: string }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp size={size} color={color} weight="bold" />;
}
```

- [ ] **Step 4: Gate** — tests pass, tsc clean, **`npx expo export --platform android` MUST pass** (new native + JS deps through metro).

- [ ] **Step 5: Commit** — `feat(mobile): icon foundation — phosphor bold via react-native-svg`

---

### Task 4: Welcome screen + first-run gate (mockup №1, lines 285–305)

**Files:**
- Create: `apps/mobile/app/welcome.tsx`
- Create: `apps/mobile/lib/first-run.ts`
- Create: `apps/mobile/tests/first-run.test.ts`
- Modify: `apps/mobile/app/index.tsx` (gate)
- Modify: `apps/mobile/app/onboarding.tsx` (finish also sets `latag.welcomed`)
- Modify: `apps/mobile/app/_layout.tsx` (register route if the Stack lists screens explicitly)

**Interfaces:**
- Consumes: `Icon` (Task 3), `PrimaryButton`/`SecondaryButton`, sign-in route `/auth/sign-in`, FONT/COLORS.
- Produces: `decideStartRoute(welcomed: boolean, onboarded: boolean): "/welcome" | "/onboarding" | null` (null = stay on sessions). Flags: `latag.welcomed`, `latag.onboarded` (AsyncStorage, value `"1"`).

- [ ] **Step 1: Failing tests**

```ts
// apps/mobile/tests/first-run.test.ts
import { decideStartRoute } from "../lib/first-run";

test("fresh install -> welcome", () => expect(decideStartRoute(false, false)).toBe("/welcome"));
test("welcomed but not onboarded -> onboarding", () => expect(decideStartRoute(true, false)).toBe("/onboarding"));
test("existing user (onboarded pre-welcome-era, never welcomed) -> stays in app", () =>
  expect(decideStartRoute(false, true)).toBeNull());
test("fully initialized -> stays in app", () => expect(decideStartRoute(true, true)).toBeNull());
```

- [ ] **Step 2: Verify fail**, then implement:

```ts
// apps/mobile/lib/first-run.ts
/**
 * Welcome shows only for genuinely fresh installs. Users who onboarded
 * before the welcome screen existed (onboarded && !welcomed) must never
 * see it after an update — onboarded wins.
 */
export function decideStartRoute(welcomed: boolean, onboarded: boolean): "/welcome" | "/onboarding" | null {
  if (onboarded) return null;
  return welcomed ? "/onboarding" : "/welcome";
}
```

- [ ] **Step 3: Verify pass.**

- [ ] **Step 4: Rewire the gate in `app/index.tsx`**

Replace the current single-flag onboarding check: read both keys via `AsyncStorage.multiGet(["latag.welcomed", "latag.onboarded"])`, call `decideStartRoute`, `router.replace(route)` when non-null. Keep the existing loading-state pattern (don't flash the sessions list before the decision).

- [ ] **Step 5: Build `app/welcome.tsx`** — parity checklist (mockup lines 285–305):

Layout: `flex-1 bg-bg px-4`, content block vertically centered (`flex-1 justify-center`), actions pinned at bottom, safe-area padded like onboarding.
- [ ] Logo mark: reuse brand mark — `<Image source={require("../assets/images/android-icon-foreground.png")} style={{ width: 96, height: 96, marginLeft: -14 }} />` above the wordmark.
- [ ] Wordmark "LATAG": `FONT.displayBlack`, 46px, uppercase, `text-acid`, lineHeight 46 (`.wordmark`: 46px/900/125%/uppercase/acid).
- [ ] Pitch: 15px `FONT.text` `text-inkdim`, `marginTop 8, marginBottom 22`, maxWidth ~30ch: "Log fast. Know your margins.\nWork where there's no signal."
- [ ] 3 feature rows (`.featrow`: flex-row, gap 12, paddingVertical 10, 14px inkdim, icon 18 acid): `Target` "Two buying modes — Selector & Bulto" · `Camera` "5-second logging, zero typing" · `WifiSlash` "100% offline after activation".
- [ ] Primary: `PrimaryButton label="Continue with Email"` → `router.push("/auth/sign-in")`.
- [ ] Secondary (h-12 pill, surface2 + hairline border, 14px display uppercase — reuse `SecondaryButton`): "Start offline — sign in later" → `await setWelcomed(); router.replace("/onboarding")`.
- [ ] Footer: 11.5px `text-inkfaint` centered, marginBottom 8: "Sign-in is only for Pro licensing.\nYour inventory never leaves this phone."
- [ ] Flag helper in `lib/first-run.ts`: `export async function setWelcomed() { await AsyncStorage.setItem("latag.welcomed", "1").catch(() => {}); }` (import AsyncStorage there; failure-tolerant like onboarding).
- [ ] Sign-in path also welcomes: in `app/auth/sign-in.tsx`, after a successful `completeSignIn(...)`, call `setWelcomed()` (idempotent; no-op for already-welcomed users).
- [ ] `app/onboarding.tsx` `finishOnboarding`: also set `latag.welcomed` (covers users who entered onboarding directly pre-welcome and edge navigation).

- [ ] **Step 6: Gate + commit** — full suite, tsc, expo export. `feat(mobile): welcome screen + first-run gate (mockup #1)`

---

### Task 5: Primitives parity — ui.tsx, Money currency, AppToast (mockup CSS lines 67–110, 162–173)

**Files:**
- Modify: `apps/mobile/components/ui.tsx`
- Modify: `apps/mobile/lib/format.ts` + `apps/mobile/tests/format.test.ts`
- Modify: `apps/mobile/components/AppToast.tsx` (verify/fix against `.toast` spec)
- Create: `apps/mobile/components/AppHead.tsx`

**Interfaces:**
- Produces: `formatPesoParts(value: number): { symbol: "₱"; amount: string }`; `<AppHead title onBack right? />` (back = 40px circle surface2 + CaretLeft 18 inkdim; title 21px FONT.display, ellipsized); `Money` renders the ₱ smaller than digits; `PrimaryButton` accepts optional `icon?: IconName`.

- [ ] **Step 1: TDD `formatPesoParts`** — failing tests in `tests/format.test.ts`:

```ts
import { formatPesoParts } from "../lib/format";
test("splits symbol and grouped amount", () =>
  expect(formatPesoParts(12700)).toEqual({ symbol: "₱", amount: "12,700" }));
test("zero", () => expect(formatPesoParts(0)).toEqual({ symbol: "₱", amount: "0" }));
```

Implement by reusing the existing `formatPeso` grouping logic (extract shared helper; `formatPeso` keeps returning the joined string — its tests must stay green).

- [ ] **Step 2: `Money` parity** (`.money`/`.hero .big`/`.row .price`): hero → symbol at 0.65em weight 600 (22px `FONT.semibold`) + digits 34px `FONT.displayBlack` acid; row → symbol 0.75em (13px `FONT.semibold`) + digits 17px `FONT.bold` ink. Baseline-align via nested `<Text>` (RN aligns nested text baselines automatically). Keep `fontVariant: ["tabular-nums"]` on the outer text.

- [ ] **Step 3: `Badge` parity** (`.badge`): fontSize 10.5, `FONT.display`, letterSpacing 0.42, paddingHorizontal 9, paddingVertical 3, radius pill (keep), colors unchanged.

- [ ] **Step 4: `PrimaryButton` parity** (`.btn-primary`): margins `marginTop 16, marginBottom 12` (now `my-3` = 12/12 — fix to `mt-4 mb-3`), letterSpacing `0.48` (0.03em of 16), optional leading `icon` prop rendered at 18 `COLORS.acidInk` with gap 8. `SecondaryButton`: letterSpacing 0.42 (0.03em of 14); confirm h-12/pill/border already match.

- [ ] **Step 5: `FieldLabel` parity** (`.fieldlabel`): letterSpacing exactly 0.92 (0.08em of 11.5) — currently 1; margins mt-4 mb-2 already correct.

- [ ] **Step 6: `AppHead` component** (`.apphead`, used by 8 screens later):

```tsx
import { Pressable, Text, View } from "react-native";
import { Icon } from "./Icon";
import { FONT, COLORS } from "../lib/theme";

/** Mockup .apphead: 40px circular back on surface2, 21px expanded-800 title, 12px gap, 12/8 vertical padding. */
export function AppHead({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 pb-2 pt-3">
      {onBack ? (
        <Pressable hitSlop={6} onPress={onBack} className="h-10 w-10 flex-none items-center justify-center rounded-full bg-surface2">
          <Icon name="CaretLeft" size={18} color={COLORS.inkDim} />
        </Pressable>
      ) : null}
      <Text numberOfLines={1} style={{ fontFamily: FONT.display }} className="min-w-0 flex-1 text-[21px] text-ink">{title}</Text>
      {right}
    </View>
  );
}
```

- [ ] **Step 7: `AppToast` audit** (`.toast`): surface2 bg, hairline border, radius 12, padding 12/16, 14px `FONT.semibold`, accent word acid. Fix any drift; ensure `onPress` pass-through from Task 2 works.

- [ ] **Step 8: Gate + commit** — whole suite (Money/Badge changes may touch snapshots — fix tests only if assertions encode the OLD wrong values). `feat(mobile): primitives parity — money currency scale, badge, buttons, apphead, toast`

---

### Task 6: Parity group 1 — onboarding + sign-in (mockups №2–4, lines 307–377)

**Files:**
- Modify: `apps/mobile/app/onboarding.tsx`
- Modify: `apps/mobile/app/auth/sign-in.tsx`
- Modify: `apps/mobile/components/PhotoSlot.tsx` (if drifted)
- Test: `apps/mobile/tests/otp-countdown.test.ts` (new)

**Interfaces:**
- Consumes: `Icon`, `AppHead`, `FieldLabel`, `PrimaryButton`.
- Produces: `formatCountdown(seconds: number): string` in `lib/format.ts` ("0:42" style).

**Onboarding checklist (№3–4):**
- [ ] ModeCard → `.obcard`: radius 14 (now `rounded-card`=12), padding 16, flex-row `gap 14 items-start`; NEW leading icon tile 44×44 radius 12 surface2 with acid icon (`Target` for Selector, `Package` for Bulto); title 16px `FONT.display`; body 13px `text-inkdim` lineHeight 19 (1.45), marginTop 3. Bulto card keeps `border-acid`.
- [ ] Pane titles stay 24px `FONT.display` (matches mockup's inline 24px/800/118%).
- [ ] Camera pane: PhotoSlot vs `.slot`: dashed 1.5 hairline, radius 10, gap 6, label 11px semibold inkfaint, icon `Camera` 18 at 0.8 opacity above label.
- [ ] Privacy card on pane 2 uses the same `.obcard` shape with `ShieldCheck` icon.

**Sign-in checklist (№2):**
- [ ] Replace drag-handle header with `AppHead title="Sign in"` (email step) / `"Enter code"` (code step), back: email step → `router.back()`, code step → back to email step.
- [ ] Sub-copy 13.5px inkdim, margins 4→18 (`.mock` line 314): code step shows the email in `FONT.semibold text-ink` inline.
- [ ] OTP boxes (`.otp`): replace the single 28px input with 6 visual boxes (flex-row gap 8; each flex-1 aspectRatio 0.86, radius 12, surface2, hairline border; digit 24px `FONT.display` centered; active box `border-acid`) driven by one invisible `TextInput` (`autoComplete="one-time-code"`, value length picks the active box). Keep all existing verify logic/toasts.
- [ ] Resend countdown: "Didn't get it? Resend in 0:42" — 12.5px inkfaint, marginTop 14; live countdown from 45s via `formatCountdown` (TDD below); after 0:00 becomes the existing tappable "Resend". "Use a different email" stays.
- [ ] Footer under Verify: 11.5px inkfaint centered: "After this, Latag never asks for a connection again." (adjust to existing honest copy: keep as mockup — sign-in itself is the only online step).

- [ ] **TDD countdown:** failing tests → `formatCountdown(45)==="0:45"`, `formatCountdown(5)==="0:05"`, `formatCountdown(0)==="0:00"`, `formatCountdown(90)==="1:30"` → implement in `lib/format.ts` → pass.

- [ ] **Gate + commit** — `feat(mobile): first-run parity — obcards with icons, otp boxes, resend countdown (mockups 2-4)`

---

### Task 7: Parity group 2 — sessions list, empty state, new session (mockups №5–7, lines 378–467)

**Files:**
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/app/session/new.tsx`
- Modify: session card component (wherever the list card lives — likely `components/SessionCard.tsx` or inline in index)

**Checklist (№5 sessions list):**
- [ ] Header: "Latag" 26px `FONT.displayBlack` acid uppercase + right-side 40px circle surface2 with `GearSix` 18 inkdim → `/settings` (read mockup lines 380–390 for exact arrangement).
- [ ] Session card `.scard`: surface1, hairline, radius 12, padding 16, marginBottom 12; top row gap 8 with title 17px `FONT.semibold` ellipsized + mode `Badge`; location line 12px inkfaint marginTop 2; foot row `justify-between items-baseline` marginTop 16, count 12px inkfaint, value 22px `FONT.display` acid with small ₱ (use `Money` row-hero middle: symbol 0.68em ≈ 15px `FONT.semibold`) — extend `Money` with `size="card"` if needed (22px digits).
- [ ] FAB / new-session CTA per mockup lines ~404–412 (acid pill or circle with `Plus` — match markup exactly).
- [ ] **№6 empty state**: `.ghostcard` — dashed 1.5 hairline radius 12 height 92 centered 13px inkfaint copy + the header/CTA identical to №5 (read lines 415–437 for copy).

**Checklist (№7 new session sheet):**
- [ ] Grab handle 44×4 radius 2 `#3A3A3A` centered marginBottom 14; title 19px `FONT.display` (`.sheet h4`); sub 12.5px inkfaint margins 2→14.
- [ ] MODE `FieldLabel` + segmented control `.seg`: surface2 pill, padding 4, gap 4, options h-11 pill 13px `FONT.display` letterSpacing 0.39; active = acid bg acidink text.
- [ ] Name/location fields `.field`: h-13 (52), radius 14, surface2, hairline, paddingHorizontal 16, 15px text, marginBottom 10, placeholder inkfaint.
- [ ] BALE COST label + wheel only in Bulto mode (existing logic stays).
- [ ] Bottom `PrimaryButton` unchanged ("Start session" copy per mockup line ~464).

- [ ] **Gate + commit** — `feat(mobile): sessions + new-session parity (mockups 5-7)`

---

### Task 8: Parity group 3 — dashboards Selector + Bulto (mockups №8–9, lines 468–542)

**Files:**
- Modify: `apps/mobile/app/session/[id]/index.tsx` (+ any dashboard subcomponents)

**Checklist:**
- [ ] `AppHead` with session title + mode badge (right slot); back to sessions.
- [ ] Hero `.hero`: paddingVertical 12→8; label 13px `FONT.medium` inkfaint; big number via `Money size="hero"` (34/900/acid, small ₱ at 0.65em); sub-row `.hero .sub`: flex-row gap 20 marginTop 8, each stat = value 17px `FONT.bold` block + caption 12px inkfaint.
- [ ] Selector (№8): stats = Spent / Projected / Realized per mockup lines 470–487; statline `.statline`: flex-row gap 14, 12px inkfaint, values `FONT.semibold` inkdim, paddingTop 8 paddingBottom 2.
- [ ] Bulto (№9): recovery bar `.recovery`: track h-3 (12px) pill surface2 hairline border, fill acid pill absolute, break-even tick 2px inkdim extending 5px above/below (overflow visible), margins 12→6; legend row `justify-between` 12px inkfaint.
- [ ] Item rows `.row`: paddingVertical 12, hairline bottom border; 64px thumb radius 10 surface2 hairline (expo-image `recyclingKey` intact); meta title 17px `FONT.semibold` ellipsized + sub 12px inkfaint marginTop 2; right price 17px `FONT.bold` with small ₱ + sold state (thumb opacity 0.45, title inkdim, SOLD badge).
- [ ] Add-item FAB/CTA + export affordance per mockup markup (read lines 495–507 / 530–542 exactly).

- [ ] **Gate + commit** — `feat(mobile): dashboard parity — hero, statline, recovery bar, rows (mockups 8-9)`

---

### Task 9: Parity group 4 — Rapid Console + camera (mockups №10–11, lines 543–606)

**Files:**
- Modify: `apps/mobile/app/session/[id]/add.tsx`
- Modify: `apps/mobile/components/Wheel.tsx` (or wherever the wheel lives)
- Modify: `apps/mobile/app/session/[id]/camera.tsx`

**Checklist (№10 console):**
- [ ] `AppHead` title per mockup line ~552 (session name, 17px variant — mockup uses smaller h3 here: 17px; keep `AppHead` but allow `size` override or match exactly).
- [ ] Field labels: BRAND · CATEGORY · CONDITION · PIT-TO-PIT · LENGTH · COST · PRICE — all `FieldLabel` (11.5/semibold/0.92 spacing) with mockup's `&ensp;·&ensp;` separators where combined.
- [ ] Wheel `.wheel`: track h-14 radius 14 surface2 hairline; side values 15px `FONT.semibold` inkfaint scaled 0.82, edge opacity 0.35; center value 28px `FONT.display` ink with 3px acid underline (10% inset, 6px below); unit chip absolute right 14 centered 12px semibold inkfaint. Custom-amount escape hatch stays.
- [ ] Chips row: 44px chips, gap 8, paddingVertical 4 (matches `Chip` — verify).
- [ ] Photo slots + Save button spacing per mockup lines 543–582.

**Checklist (№11 camera):**
- [ ] Viewfinder `.vf`: flex-1 radius 16 marginTop 8; 4 acid corner brackets 26×26 border-3 inset 18 with 6px outer-corner radius; hint text bottom 16 centered 11px semibold inkfaint letterSpacing 0.88.
- [ ] Shutter: 74px circle, 4px ink ring, acid inner fill inset 6, centered marginVertical 16.
- [ ] Slot chips `.slotchips`: centered row gap 8 marginTop 12; chip = pill border hairline padding 5/11, 11px `FONT.display` letterSpacing 0.44 inkfaint; done → acid text+border with `Check` 12; current → ink text+border.
- [ ] Header: back/close + "Back photo" style title 17px (mockup line 589).

- [ ] **Gate + commit** — `feat(mobile): console + camera parity (mockups 10-11)`

---

### Task 10: Parity group 5 — item detail + mark sold (mockups №12–13, lines 607–661)

**Files:**
- Modify: `apps/mobile/app/item/[id]/index.tsx`
- Modify: `apps/mobile/app/item/[id]/sold.tsx`

**Checklist (№12 item detail):**
- [ ] `AppHead` with item title + condition badge right.
- [ ] Photo carousel `.carousel`: radius 14 hairline border, aspect 4/3.5; photo-type tag overlay top-left 12/12: 11px semibold on `rgba(0,0,0,0.72)` radius 6 padding 3/8 inkdim; pager dots 6px, gap 6, margins 10→2, active acid.
- [ ] KV rows `.kv`: paddingVertical 12 hairline bottom border, 15px — key inkfaint, value `FONT.semibold` ink; keys per mockup lines 617–630 (Brand, Category, Condition, Pit-to-pit, Length, Cost, Price).
- [ ] Actions: Mark sold primary + edit/delete secondary/danger per mockup; `PencilSimple`/`Trash` icons 16.
- [ ] Sold state variations (badge, price strike/dim) if shown in mockup markup.

**Checklist (№13 mark-sold sheet):**
- [ ] Sheet chrome: grab 44×4, h4 19px `FONT.display`, sub 12.5 inkfaint.
- [ ] "SOLD FOR" `FieldLabel` + price wheel (same wheel spec as Task 9) prefilled with asking price; custom-amount entry stays.
- [ ] Confirm `PrimaryButton` + cancel secondary; spacing per lines 637–661.

- [ ] **Gate + commit** — `feat(mobile): item detail + mark-sold parity (mockups 12-13)`

---

### Task 11: Parity group 6 — IG export + settings (mockups №14–15, lines 662–741)

**Files:**
- Modify: `apps/mobile/app/session/[id]/export.tsx`
- Modify: `apps/mobile/app/settings.tsx`

**Checklist (№14 export):**
- [ ] `AppHead title="IG Drop"`.
- [ ] Item pick rows: `.row` spec + `.check` boxes 24×24 radius 8 border-1.5 hairline; checked = acid bg, acidink `Check` 14.
- [ ] Caption preview `.caption-preview`: surface1, hairline, radius 12, padding 14/16, 13.5px lineHeight 22 (1.65) inkdim, highlighted spans `FONT.semibold` ink; editable-canvas feature stays.
- [ ] Copy CTA with `ClipboardText` icon; copied toast matches `.toast` (acid accent word).

**Checklist (№15 settings):**
- [ ] `AppHead title="Settings"`.
- [ ] All rows → `.set-row`: paddingVertical 14, hairline bottom border, gap 12; leading icon tile 36×36 radius 10 surface2 with 18px inkdim icon; title 15px `FONT.semibold`; sub 12px inkfaint marginTop 1.
- [ ] Icon mapping: account `EnvelopeSimple` (or `SignOut` on the sign-out row) · license/Pro `ShieldCheck` · refresh license `ArrowsClockwise` · storage `HardDrives` · free-logs counter `Package` · version `GearSix` · check-updates `Download`.
- [ ] Section labels use `FieldLabel`; sign-out row text danger; version + check-updates rows (Task 2) restyled to `.set-row`.
- [ ] Read mockup lines 700–741 for exact row order/copy and match.

- [ ] **Gate + commit** — `feat(mobile): export + settings parity (mockups 14-15)`

---

### Task 12: Phase gate — docs, QA, whole-phase review prep

**Files:**
- Modify: `docs/qa/mobile-mvp-checklist.md` (Phase D section)
- Modify: `docs/superpowers/specs/2026-07-15-latag-phase-d-ota-welcome-parity-design.md` (§5 mark shipped)
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: QA checklist Phase D section** — add: fresh install shows Welcome (both paths land in onboarding); updated install (existing data) skips Welcome; OTA: launch with a published update → restart prompt appears, tap restarts into new bundle; Settings shows version + update id; manual check offline → honest error toast; icon rendering sweep (every screen shows Phosphor icons, no blanks); per-screen parity spot check against `docs/mockups/latag-mvp.html` side by side.
- [ ] **Step 2: Full gate** — whole suite, tsc, `npx expo export --platform android`.
- [ ] **Step 3: Ledger + spec §5 updates; commit** — `chore(mobile): Phase D QA + spec update — D complete`
- [ ] **Step 4 (post-review, coordinator):** whole-phase review → fixes → merge → **one APK rebuild** (`npx eas-cli build --profile preview --platform android`) → after install, future JS fixes ship via `eas update --channel preview --message "..."`.

---

## Self-Review Notes

- **Spec coverage:** D1 → Tasks 1–2; D2 → Task 4; D3 extraction → Global Constraints + per-task checklists; primitives-first → Tasks 3, 5; six screen groups → Tasks 6–11 (first-run trio spread across 4 and 6); rebuild/publish workflow → Tasks 1, 12. Sessions empty state → Task 7. ✓
- **Type consistency:** `runUpdateCheck`/`versionLabel` (T2) used in T2 settings; `Icon`/`IconName` (T3) consumed T4–T11; `formatPesoParts` (T5) powers `Money` variants used T7–T10; `decideStartRoute`/`setWelcomed` (T4) self-contained; `AppHead` (T5) consumed T6–T11. ✓
- **Placeholder scan:** parity tasks intentionally direct implementers to exact mockup line ranges for markup/copy they must transcribe — the checklist values themselves are exact. No TBDs. ✓
