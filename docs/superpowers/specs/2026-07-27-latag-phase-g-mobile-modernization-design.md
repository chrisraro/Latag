# Latag Phase G — Mobile Modernization

**Date:** 2026-07-27 · **Status:** G1 + G2 shipped; G3 partly shipped (pull-to-refresh) and partly gated off pending a native build — see §5 · **Depends on:** Phases A–F shipped (v1.1.0 binary, OTA pipeline live)

## 1. Goal

Turn the app from "a list you log into" into a product you open every morning: a real Home overview, a native floating toolbar with a quick-add button, items that no longer require a batch, and SDK 57 native components, gestures and motion throughout — on the existing Warehouse Console identity.

**Owner decisions (2026-07-27):** batch-less items are modelled by making the link optional (not a phantom batch) · Home is a business snapshot + quick actions (not a feed) · native components used where native wins, custom kept where identity lives.

**Sub-phases:** G0 probe · G1 shell (Home + toolbar + Settings move) · G2 solo items · G3 native components, gestures, motion.

## 2. OTA feasibility (verified, then proven)

`@expo/ui@57.0.4` ships 19 universal components plus ~50 each for Jetpack Compose and SwiftUI. Its `plugin/` is a **Babel** plugin (icon-asset rewriting), not an Expo config plugin, and the package was in `package.json` when the v1.1.0 binary was built, so Expo autolinked the native module. Using it should therefore ship **OTA with no rebuild**.

**G0 — the probe (first task, ships alone):** render exactly one `@expo/ui` component (a universal `Switch` inside a `Host`) in Settings, publish OTA, and confirm on device that it renders rather than crashing. Every later task assumes this result. If it fails, Phase G pivots to custom components plus a version bump and rebuild — discovered in minutes instead of after four screens.

`expo-glass-effect`, `react-native-gesture-handler`, `react-native-reanimated` and `expo-haptics` are all already installed, so gestures, motion and glass need no new native code either.

## 3. G1 — Navigation shell

### Floating toolbar

`HorizontalFloatingToolbar` (Jetpack Compose) / its SwiftUI counterpart, themed to the design system through its own colour props — `toolbarContainerColor: surface1`, `toolbarContentColor: inkFaint`, `fabContainerColor: acid`, `fabContentColor: acidInk`. Active tab uses `acid`. The existing hand-built `FloatingTabBar` is kept behind a platform/availability fallback so a component failure can never leave the app unnavigable.

**Tabs: Home · Inventory · Batches · Shop.** The FAB is **quick-add**: one tap opens the item composer with no batch selected.

### Settings moves to the header

Settings leaves the toolbar. Every top-level screen's `AppHead` right slot gains a gear button (40px circle, `GearSix`, a11y label "Settings") in the slot currently holding a count badge — counts already appear in each screen's totals strip, so no information is lost. `/settings` keeps its route and remains reachable by deep link.

### Home screen (`app/(tabs)/index.tsx`, Inventory moves to `app/(tabs)/inventory.tsx`)

Sections, top to bottom:

1. **Snapshot** — stock value (available items at target price), items available, sold this week, profit this month. Tabular numerals, acid for the headline figure.
2. **Next bale run** — soonest scheduled batch with live countdown, location pin and a Start now action; hidden entirely when nothing is scheduled (no empty-state noise).
3. **Shop status** — live/offline, published count, one-tap copy of the shop link; for Free users, the Pro pitch instead.
4. **Recent items** — horizontal strip of the last 8 logged items, tapping opens item detail.
5. **Quick actions** — New batch · Export a drop · Open shop.

Every card deep-links to the tab that owns it. All figures come from existing local queries; no new schema.

## 4. G2 — Solo items (SHIPPED 2026-07-28)

`items.sessionId` becomes **nullable**. An item with no batch is a first-class citizen: item detail shows "No batch" where the batch name would be, and Inventory gains a **Loose items** filter.

**Migration risk is explicit.** Dropping NOT NULL forces a SQLite table rebuild — the exact operation where drizzle-kit generated broken SQL in E1 (its INSERT…SELECT referenced columns that did not yet exist). The plan therefore requires: read the generated SQL line by line before running it, verify the INSERT…SELECT copies every column of the current `items` shape, and extend the zero-loss test to seed a fully-populated pre-migration item (plus a photo child row) and assert every field survives.

The quick-add composer is the existing Rapid Console opened without a `sessionId`. Selector/Bulto math is unaffected: it aggregates per batch, and loose items simply belong to no batch. Publishing, selling, editing and export all work unchanged.

**Shipped as specced.** Migration `0005_futuristic_iron_patriot.sql` was read line by line before it ran; the zero-loss proof in `tests/schema.test.ts` seeds a fully-populated item plus `photos` and `publish_queue` children and asserts every field round-trips. The composer lives at `/item/new` and the tab bar's FAB routes there, so no batch is ever invented. Note for the record: the owner's local inventory was cleared during the 2026-07-27 crash recovery, so the migration's real-data path has not yet been exercised on a device carrying pre-0005 rows — the QA checklist carries that line forward for the first device that does.

## 5. G3 — Native components, gestures, motion (BUILT AND TESTED, GATED OFF — pending a native build)

**Native where it wins:** `BottomSheet` (item composer, filter sheet), `SegmentedButton` / `SingleChoiceSegmentedButtonRow` (status + sort), `SearchBar` (inventory search), `Switch` (shop toggles, settings), `DatePicker` (batch scheduling), `Snackbar` (undo affordances), `Chip` (department filters) — each rendered inside `Host`, each themed to the design tokens.

**Custom where identity lives:** item rows, money typography, the price wheels, session/shop cards, `AppHead`. These carry the brand and stay.

**Gestures** (react-native-gesture-handler, installed): swipe an inventory row to mark sold or toggle publish; swipe a batch card to archive; swipe-to-dismiss on sheets. Every destructive swipe requires confirmation or offers undo via `Snackbar`.

**Pull-to-refresh** on all four tabs: re-reads local queries and, when the shop is set up, drains the publish queue — the honest "refresh" for an offline-first app.

**Motion** (react-native-reanimated, installed): list entrance stagger, FAB→composer transition, shared-element item open, tab-switch cross-fade. All respect `prefers-reduced-motion`; none block input.

### Status 2026-07-28 — what actually ships

**Pull-to-refresh SHIPPED** on all four tabs. It uses RN core's `RefreshControl` and the pure `useRefresh` hook — no Compose, no worklets — so it was never in scope for the gate below.

**Everything else in §5 is written, unit-tested, and switched off.** `apps/mobile/lib/native-ui.ts` exports two flags, both `false`, and `tests/native-ui-gate.test.ts` fails the build if either flips on `master`:

- `NATIVE_UI_ENABLED` gates every `@expo/ui` Compose view — the native floating toolbar (`NativeTabBar`) and the segmented status/sort controls (`components/native/Segmented.tsx`). Fallbacks: `FloatingTabBar` and the `Chip` row, both of which shipped before and carry the Warehouse Console tokens that stock Material cannot.
- `NATIVE_ANIMATION_ENABLED` gates everything that would run a Reanimated worklet — `SwipeRow` and `lib/motion.ts`. Rows render at rest and swipe rows are ordinary rows.

**Why.** On 2026-07-27 an OTA shipped `HorizontalFloatingToolbar` as the tab bar and crash-looped the owner's device. The component had a capability check *and* a React error boundary; both were useless, because a crash inside Compose is a native exception on the Android UI thread and never becomes a JS exception. `checkAutomatically` is `NEVER`, so the app only fetches an update from our own JS — which the crash killed before the download finished. **An OTA that crashes on launch is very nearly unrecallable by the device it is crashing.** Our guards only ever protected against a native view that was MISSING, never one that was BROKEN, and "broken" is not something JS can detect. The same reasoning covers Reanimated: no JS on `master` had ever created a shared value on that binary, and the entrance animations wrap Home's recent strip — the boot screen.

**The rule this establishes: no Compose view and no worklet ships over the air, ever.** They go out in a native build, verified against `adb logcat *:E` on a real device, where a bad one is caught before release and the store rollout can be halted. Consequence for feature parity: every action a swipe would have offered is still reachable from the item screen, so nothing is unreachable — only less pleasant. The two undo toasts ("Sold — tap to undo", "Publishing — tap to undo") are raised only by the swipe handlers and are therefore dormant until swipe ships.

**Native `SearchBar` REJECTED on the merits, not deferred.** `components/native/SearchField.tsx` documents the reading of the installed @expo/ui 57.0.4: `SearchBarProps` is `{ onSearch, modifiers, children }` with no colour props at all (Material draws its own container, query text and placeholder over whatever the `background` modifier paints), and neither `SearchBar` nor `DockedSearchBar` accepts a `value` — so live "type and the list narrows" would degrade to "type, press enter, wait", and neither the clear button nor a programmatic reset could empty the field. The custom field stays. This one does not come back with the native build.

**Deferred from §5 as specced, never built:** `BottomSheet` for the composer/filter sheet, native `DatePicker` for batch scheduling, native `Snackbar`, native `Chip` for department filters, swipe-to-dismiss on sheets, and the shared-element item open. Batch swipe shipped as add-item / delete-batch rather than the specced archive (there is no archive concept in the data model). These wait for the same native build.

## 6. Cross-cutting

- **Offline-first unchanged.** No new network surfaces. Pull-to-refresh works offline (local re-read); the queue drain is best-effort as always.
- **Platform honesty.** `@expo/ui` forks per platform. Where a component exists on only one, the custom equivalent is used on the other — never a broken or empty control.
- **Accessibility:** native components bring their own semantics; custom ones keep explicit roles/labels/state. 44px targets throughout.
- **Testing:** TDD every logic module (snapshot math, filters incl. loose items, swipe-action reducers). Component tests where `@expo/ui` can be mocked. Device QA gains a Phase G section.
- **Ship path:** all sub-phases OTA on channel `preview`, subject to G0's result.

## 7. Out of scope

Payments and custom domain (owner-blocked, deliberately deferred) · seller avatars · Instagram scheme queries and the Expo patch-drift sweep (both need the next native build) · web changes of any kind.
