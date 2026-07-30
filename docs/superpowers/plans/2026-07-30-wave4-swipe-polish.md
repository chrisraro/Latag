# Wave 4 — Swipe navigation, RevenueCat install, and polish

Final wave from the 2026-07-30 frontend audit. Wave 1 shipped `c91ef33`,
Wave 2 Task 1 shipped `00b2795`, Wave 3 shipped `26d36ea`.

Owner decisions (2026-07-30):
- **IG drop export is no longer a Pro feature.** Stop selling it. The web already
  lists it as free and the code already treats it as free.
- **Install `react-native-purchases` now**; RevenueCat configuration stays pending.
- Swipe navigation: **edge-swipe, OTA-safe, default ON** (decided earlier).

## Global constraints

- **OTA safety is absolute for everything except Task 2.** No `@expo/ui` Compose
  view and no Reanimated worklet. `NATIVE_UI_ENABLED` and
  `NATIVE_ANIMATION_ENABLED` stay `false`; `tests/native-ui-gate.test.ts`
  enforces it.
- `expo-crypto` is the only UUID source.
- Do not change design token VALUES; `packages/tokens` is the source of truth.
  Use existing tokens.
- **Naming:** Batch→Run and selector→selections are DEFERRED (Wave 2 tail). Use
  CURRENT names. Do not half-rename.
- Gates after every task: `pnpm typecheck`, `pnpm typecheck:web`, `pnpm test`,
  `pnpm test:web` — all clean.
- Never run `pnpm lint` / `expo lint` — it mutates the lockfile in this repo.

## Task 1 — Stop selling IG drop export as Pro

`apps/mobile/app/pro/paywall.tsx:29-33` lists "IG drop export" as a Pro feature.
It is not gated: `apps/mobile/app/session/[id]/export.tsx` has no entitlement
check and is reachable from `home.tsx` and `session/[id]/index.tsx`. Wave 3
confirmed the website correctly lists it as free.

The subtitle is separately false: it says "Share your curated selection directly
to Instagram stories", but `apps/mobile/lib/ig-share.ts` saves to an album, copies
the caption to the clipboard and opens Instagram — it never posts a story.

1. Remove the IG drop export entry from the paywall's Pro feature list.
2. Check the rest of that list the same way. Every remaining Pro bullet must
   correspond to something actually gated — find the gate in code and cite it.
   Anything ungated must come out or be gated, and removing is the owner's stated
   preference unless the feature is obviously meant to be paid.
3. Sweep for the same false "posts to your story" phrasing elsewhere
   (`GoProSheet.tsx`, onboarding, web) and correct it to what `ig-share.ts`
   actually does.
4. Test: a guard asserting the paywall lists no feature that lacks a gate, or at
   minimum that IG export is absent from it.

## Task 2 — Install `react-native-purchases` (NATIVE — cannot ship over OTA)

**This is the one task in the wave that changes native dependencies.** It must be
kept in its own commit so it can be reasoned about separately from the
OTA-shippable work.

1. Install with `npx expo install react-native-purchases` so the version matches
   the Expo SDK 57 / RN 0.86 pairing. Do not hand-edit `package.json` or pick a
   version yourself.
2. **Delete `apps/mobile/types/react-native-purchases.d.ts`.** It is a hand-written
   stub written when the module was absent; once the real package ships its own
   types the stub will shadow or conflict with them. Then fix any type errors the
   real types surface — the stub was a guess and the real API may differ.
3. Do NOT add a config plugin entry, API key, or any call-site change. RevenueCat
   configuration is explicitly pending with the owner.
4. Verify the app is still runtime-inert without configuration: `RC_API_KEY` is
   empty, so `isRevenueCatConfigured()` is false and no RevenueCat code path runs.
   Prove it with a test.
5. **Record in the report, unambiguously:** this module is NOT in the installed
   1.1.0 binary. It reaches devices only via `eas build`. Until then every
   `await import("react-native-purchases")` still throws and is caught, exactly as
   today — so the OTA remains safe, but purchases remain impossible.
6. Confirm `pnpm-lock.yaml` changed only as a consequence of the install.

## Task 3 — Edge-swipe between tabs (OTA-safe)

Feasibility is already established in `.superpowers/audit/native-swipe-feasibility.md` — read it first.

Key findings that constrain the design:
- The gate test matches only `react-native-reanimated` and `ReanimatedSwipeable`.
  Plain `react-native-gesture-handler` is NOT gated, and `GestureHandlerRootView`
  is already mounted at the app root, so that native module is linked and proven
  on the shipped binary.
- **Two of the four tabs already own the horizontal axis:** Home's "Recent items"
  strip (`app/(tabs)/home.tsx:217`) and Inventory's filter chip row
  (`app/(tabs)/inventory.tsx:190`). A full-width swipe fights both. Every tab also
  carries a FlashList and a `RefreshControl`.

Implement:
1. A `Gesture.Pan()` that claims the gesture ONLY when it begins within ~24px of
   the left or right screen edge and exceeds a horizontal-dominance threshold.
   Callbacks via `runOnJS` so **no worklet is ever created**.
2. Navigate to the neighbouring entry in `TAB_DESTINATIONS`
   (`components/FloatingTabBar.tsx:19`: `index → inventory → batches → shop`).
   No wrap-around at the ends unless you can argue for it.
3. There is no finger-tracked page translation — that needs Reanimated and a
   native build. Flick-to-switch reuses the existing cross-fade. Do not fake it.
4. Respect `useReducedMotion` (`lib/motion.ts`), which the tab layout already
   consults.
5. Accessibility: swipe must remain a shortcut, never the only way to reach a
   tab. The bar stays.
6. Tests: an edge-origin horizontal pan navigates to the correct neighbour; a pan
   starting mid-screen does NOT; a mostly-vertical drag does NOT; the ends do not
   navigate past the array bounds. Assert against `TAB_DESTINATIONS` order rather
   than hardcoding route names, so the test tracks the bar.

**Done when:** an edge flick changes tabs, nothing else does, and no Reanimated
import exists.

## Task 4 — P1 polish

Read `.superpowers/audit/mobile-ux-audit.md` and work its **P1** list. Do not
attempt all of it — select the items that are (a) OTA-safe, (b) genuinely
user-affecting, and (c) not owned by a deferred wave. Explicitly EXCLUDE:

- anything requiring a token/type-scale change (Wave 2 tail owns it),
- anything requiring renaming,
- the two-card-radii reconciliation (owner decision),
- `paywall.tsx`'s visual drift from Warehouse Console — that is a design pass, not
  polish, and touching it while Task 1 edits the same file invites conflict.

Known good candidate from the audit: `app/item/[id]/index.tsx:221` hand-rolls
`text-acid` for the Price row instead of the shared `<Money>` component, breaking
DESIGN.md's rule that acid marks profit/progress, not a plain asking price.

State in your report which P1s you took, which you left, and why.

## Out of scope

- Wave 2 tail: typography, font parity, literal sweeps, Batch→Run,
  selector→selections.
- RevenueCat configuration, API keys, config plugin, and any `eas build`.
- The `drainQueue` network-attempt fix (`reason === "network"` should not burn a
  retry) — sync engine, logged for later.
- iOS availability and the Play listing status — unanswered owner questions.
