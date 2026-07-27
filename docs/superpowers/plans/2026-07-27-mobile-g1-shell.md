# G0 + G1 — Probe & Navigation Shell: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD every logic module (RED first). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove `@expo/ui` runs on the installed binary, then replace the app's shell — a real Home overview, a native floating toolbar whose FAB is quick-add, and Settings moved into screen headers.

**Architecture:** G0 is a single throwaway-able probe that de-risks everything after it. G1 then adds `app/(tabs)/home.tsx` as the new index, relocates Inventory to its own route, and swaps `FloatingTabBar` for a native `HorizontalFloatingToolbar` behind an availability fallback so navigation can never be lost. Home's numbers come from a new pure `lib/overview.ts` — no new schema, no new queries beyond what the tabs already run.

**Tech Stack:** @expo/ui 57.0.4 (installed, autolinked in v1.1.0), expo-router Tabs, drizzle/expo-sqlite, NativeWind 4, Reanimated 4 (installed).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-latag-phase-g-mobile-modernization-design.md` §2–§3 is law.
- **JS-only — no package.json/app.json changes.** Every package needed is already installed and in the v1.1.0 binary. Adding a dependency would break the OTA premise of this whole phase.
- **`@expo/ui` components must be wrapped in `<Host>`** and imported from the right entry: `@expo/ui/jetpack-compose` (Android), `@expo/ui/swift-ui` (iOS), `@expo/ui` for the 19 universal ones. Verify the export exists in `node_modules/.pnpm/@expo+ui@57.0.4*/node_modules/@expo/ui/build/...` before importing it — never assume a component name.
- **Never leave the app unnavigable.** The native toolbar renders behind a capability check with the existing `FloatingTabBar` as fallback.
- Design: Warehouse Console tokens (`lib/theme.ts`); screens `px-5`, rows `px-3 py-3.5`, cards 18px interiors, 44px targets, a11y labels, explicit `lineHeight` on ≤13px text. Native components get themed via their own colour props — never left stock Material purple.
- Gates per task from `apps/mobile`: `pnpm test` green (466+, never shrinking) · `npx tsc --noEmit` 0 · `npx expo export --platform android` ok (delete `dist/`). Commit per task with the given message; do NOT push.
- Branch: `feat/phase-g1-shell`. Repo root path contains a space — quote it.

---

### Task 0: The probe (ships alone, before anything else)

**Files:** Modify `apps/mobile/app/(tabs)/settings.tsx`

Everything in Phase G assumes `@expo/ui` renders on the installed binary. That assumption is reasoned (the package was in `package.json` when v1.1.0 was built, so Expo autolinked it; its `plugin/` is Babel-only) but unproven on a device. This task proves or kills it in five minutes.

- [ ] **Step 1: Confirm the export exists** — read `node_modules/.pnpm/@expo+ui@57.0.4*/node_modules/@expo/ui/build/universal/Switch/index.d.ts` and the package's root `index.d.ts` to get the exact import path and prop names for the universal `Switch` and `Host`.
- [ ] **Step 2: Render one component.** In Settings' App section, add a row "Native UI check" whose right side is a universal `@expo/ui` `Switch` inside a `Host`, wired to a piece of local `useState` (it controls nothing). Give the `Host` an explicit height/width so a zero-size native view can't be mistaken for a crash. Theme the switch with the acid token if it accepts colour props.
- [ ] **Step 3: Guard it.** Wrap the row in an error boundary or a `try` around the import so that if the native view is missing, Settings still renders the rest of the screen and shows "Native UI unavailable" instead of a white screen.
- [ ] **Step 4: Gate** — `pnpm test`, `npx tsc --noEmit`, `npx expo export --platform android` (delete `dist/`).
- [ ] **Step 5: Commit** — `chore(mobile): probe @expo/ui availability on the shipped binary`
- [ ] **Step 6 (coordinator):** publish OTA and ask the owner to open Settings. **Result decides the phase:** renders → continue G1 as written; crashes or shows "unavailable" → stop, and re-plan G1 with custom components plus a version bump and rebuild.

---

### Task 1: `lib/overview.ts` — Home's numbers (TDD)

**Files:** Create `apps/mobile/lib/overview.ts`, `apps/mobile/tests/overview.test.ts`

**Interfaces:**
```ts
export type Snapshot = {
  stockValue: number;      // sum of targetSellPrice for status "available"
  itemsAvailable: number;
  soldThisWeek: number;    // soldAt within the last 7 days (inclusive of now)
  profitThisMonth: number; // sum of (soldPrice - individualCost) for soldAt in the current calendar month
};
export function snapshot(items: OverviewItem[], now: Date): Snapshot;
export function recentItems<T extends { createdAt: Date }>(items: T[], limit?: number): T[]; // newest first, default 8
export function nextScheduled<T extends { scheduledAt: Date | null }>(sessions: T[], now: Date): T | null; // soonest FUTURE, null if none
```
`OverviewItem` is structural — define it locally, do not import the drizzle row type:
```ts
type OverviewItem = { status: "available" | "sold"; targetSellPrice: number; soldPrice: number | null;
                      individualCost: number; soldAt: Date | null; createdAt: Date };
```
Rules: money values are numbers, never pre-formatted (the screen formats). `profitThisMonth` uses the **calendar** month of `now`, and treats a null `soldPrice` as no profit contribution rather than negative cost. `soldThisWeek` is a rolling 7 days, not week-start. Both ignore items whose `soldAt` is null. Nothing mutates its input.

- [ ] **Step 1: Write the failing tests** — `apps/mobile/tests/overview.test.ts`:

```ts
import { snapshot, recentItems, nextScheduled } from "../lib/overview";

const NOW = new Date("2026-07-27T12:00:00Z");
const it0 = (over: Partial<Parameters<typeof snapshot>[0][number]> = {}) => ({
  status: "available" as const, targetSellPrice: 500, soldPrice: null,
  individualCost: 100, soldAt: null, createdAt: new Date("2026-07-01T00:00:00Z"), ...over,
});

test("stock value and availability count only available items", () => {
  const s = snapshot([it0({ targetSellPrice: 500 }), it0({ targetSellPrice: 300 }),
                      it0({ status: "sold", soldPrice: 900, soldAt: NOW })], NOW);
  expect(s.stockValue).toBe(800);
  expect(s.itemsAvailable).toBe(2);
});

test("sold this week is a rolling 7 days", () => {
  const s = snapshot([
    it0({ status: "sold", soldPrice: 400, soldAt: new Date("2026-07-26T00:00:00Z") }),
    it0({ status: "sold", soldPrice: 400, soldAt: new Date("2026-07-19T00:00:00Z") }), // 8 days -> out
  ], NOW);
  expect(s.soldThisWeek).toBe(1);
});

test("profit this month is calendar-month and nets out cost", () => {
  const s = snapshot([
    it0({ status: "sold", soldPrice: 900, individualCost: 100, soldAt: new Date("2026-07-05T00:00:00Z") }),
    it0({ status: "sold", soldPrice: 500, individualCost: 200, soldAt: new Date("2026-06-30T00:00:00Z") }), // last month
  ], NOW);
  expect(s.profitThisMonth).toBe(800);
});

test("a sold item with no recorded price contributes no profit", () => {
  expect(snapshot([it0({ status: "sold", soldPrice: null, individualCost: 100, soldAt: NOW })], NOW).profitThisMonth).toBe(0);
});

test("empty inventory is all zeroes, not NaN", () => {
  expect(snapshot([], NOW)).toEqual({ stockValue: 0, itemsAvailable: 0, soldThisWeek: 0, profitThisMonth: 0 });
});

test("recentItems is newest-first, capped, and does not mutate", () => {
  const rows = [it0({ createdAt: new Date("2026-01-01") }), it0({ createdAt: new Date("2026-07-01") })];
  const snap = rows.map((r) => r.createdAt.getTime());
  expect(recentItems(rows, 1)[0].createdAt.toISOString()).toContain("2026-07-01");
  expect(rows.map((r) => r.createdAt.getTime())).toEqual(snap);
});

test("nextScheduled picks the soonest future run and ignores past ones", () => {
  const past = { scheduledAt: new Date("2026-07-20T00:00:00Z") };
  const soon = { scheduledAt: new Date("2026-07-28T00:00:00Z") };
  const later = { scheduledAt: new Date("2026-08-10T00:00:00Z") };
  expect(nextScheduled([later, past, soon], NOW)).toBe(soon);
  expect(nextScheduled([past], NOW)).toBeNull();
  expect(nextScheduled([{ scheduledAt: null }], NOW)).toBeNull();
});
```

- [ ] **Step 2: Run and watch it fail** — `pnpm test tests/overview.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `lib/overview.ts` — pure, no imports beyond types.
- [ ] **Step 4: Run and watch it pass**, then the full suite.
- [ ] **Step 5: Commit** — `feat(mobile): overview math — snapshot, recent items, next scheduled run`

---

### Task 2: Native floating toolbar with quick-add FAB

**Files:** Create `apps/mobile/components/NativeTabBar.tsx`; Modify `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/components/FloatingTabBar.tsx` (keep as fallback), `apps/mobile/components/Icon.tsx` (add `House` if missing — verify it exists in `phosphor-react-native` first)

**Interfaces:** `<NativeTabBar {...BottomTabBarProps} onQuickAdd={() => void} />`. Exports `TAB_BAR_CLEARANCE` unchanged so screens keep their bottom padding.

- [ ] **Step 1: Read the real API** — `build/jetpack-compose/HorizontalFloatingToolbar/index.d.ts` (props verified to include `variant`, and colour overrides `toolbarContainerColor`, `toolbarContentColor`, `fabContainerColor`, `fabContentColor`) plus its SwiftUI counterpart if one exists. If no SwiftUI equivalent ships, iOS keeps `FloatingTabBar` — say so in the report rather than inventing one.
- [ ] **Step 2: Build `NativeTabBar`** — four destinations (Home, Inventory, Batches, Shop) and the FAB. Theme: container `COLORS.surface1`, content `COLORS.inkFaint`, active `COLORS.acid`, FAB container `COLORS.acid`, FAB content `COLORS.acidInk`. Wrap in `Host` with an explicit size. Fire `Haptics.selectionAsync()` on selection (after the guards, matching `FloatingTabBar`). a11y: labels per destination, `selected` state on the active one.
- [ ] **Step 3: Fallback, not faith.** Render `NativeTabBar` only when the native component resolves (a capability check plus an error boundary); otherwise render the existing `FloatingTabBar`. Losing navigation entirely is not an acceptable failure mode. Add a test asserting the fallback renders when the native module is mocked as unavailable.
- [ ] **Step 4: Wire the FAB** — `onQuickAdd` routes to the quick-add composer. **G2 has not landed yet**, so until it does the FAB routes to the existing add flow for the most recent batch, and if there is no batch at all it routes to `/session/new`. Leave a comment marking the line G2 replaces.
- [ ] **Step 5: Gate + commit** — `feat(mobile): native floating toolbar with quick-add FAB`

---

### Task 3: Home screen + Inventory relocation

**Files:** Create `apps/mobile/app/(tabs)/home.tsx`; `git mv apps/mobile/app/(tabs)/index.tsx apps/mobile/app/(tabs)/inventory.tsx`; create a new `apps/mobile/app/(tabs)/index.tsx` re-exporting Home (so `/` stays the home route); Modify `apps/mobile/app/(tabs)/_layout.tsx`; Create `apps/mobile/tests/home-screen.test.tsx`

**Interfaces:** Consumes `snapshot`/`recentItems`/`nextScheduled` (Task 1), `formatPeso`/`Money`, `formatCountdown`/`formatScheduleStamp` (lib/schedule), `pendingLabel` (lib/shop-sync), `getMyShop`/`cachedShop` (lib/shop-api).

- [ ] **Step 1: Failing test** — `tests/home-screen.test.tsx`, following the `useLiveQuery`/db mocking pattern already in `tests/sessions-screen.test.tsx` and `tests/shop-tab.test.tsx`. Assert: the four snapshot figures render from seeded data; the "next bale run" block is ABSENT when nothing is scheduled and PRESENT with a countdown when something is; the recent strip shows newest first; a Free account sees the Pro pitch instead of shop stats.
- [ ] **Step 2: Build the screen**, sections top to bottom:
  - `AppHead title="Latag"` (display voice) with the **gear** in the right slot → `/settings`.
  - **Snapshot card** (`surface1`, hairline, radius 14, 18px interior): stock value as the hero figure (`Money size="hero"`), then a three-up row — items available · sold this week · profit this month — each value 17px `FONT.bold` tabular with a 12px `inkfaint` caption and explicit `lineHeight`.
  - **Next bale run** — only when `nextScheduled` returns non-null: name, `formatCountdown` in acid, `formatScheduleStamp`, `MapPin` + location, and a **Start now** chip reusing the Batches-tab handler. Renders nothing at all when there is none.
  - **Shop status** — Pro with a shop: live/offline, "N published", copy-link secondary, and `pendingLabel` when the queue is non-empty. Free: the value-proposition card + "Unlock with Pro" opening `GoProSheet`.
  - **Recent items** — horizontal `ScrollView` of up to 8 thumbnails (64px, `recyclingKey`, brand-initial fallback), tap → `/item/[id]`. Hidden when inventory is empty.
  - **Quick actions** — New batch · Export a drop · Open shop.
  - `paddingBottom: insets.bottom + TAB_BAR_CLEARANCE` so nothing hides under the toolbar.
- [ ] **Step 3: Relocate Inventory** with `git mv` so history survives; fix its relative imports; register both routes in `(tabs)/_layout.tsx` with Home first.
- [ ] **Step 4: First-run gate stays put** — it lives in `app/_layout.tsx` since F1 and must NOT be reintroduced in either tab screen. Verify a fresh install still lands Welcome → onboarding → Home.
- [ ] **Step 5: Regenerate typed routes** (`npx expo start --offline`, kill after ~15s) so `/inventory` and `/home` typecheck.
- [ ] **Step 6: Gate + commit** — `feat(mobile): home overview screen, inventory moves to its own tab`

---

### Task 4: Settings moves into headers

**Files:** Modify `apps/mobile/components/AppHead.tsx`, `apps/mobile/app/(tabs)/inventory.tsx`, `apps/mobile/app/(tabs)/batches.tsx`, `apps/mobile/app/(tabs)/shop.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/components/NativeTabBar.tsx`

- [ ] **Step 1:** Add an optional `onSettings?: () => void` to `AppHead`; when present it renders a 40px `surface2` circle with `GearSix` 16 `inkDim`, a11y label "Settings", in the right slot — beside any existing right content, not replacing it silently.
- [ ] **Step 2:** Wire it on all four tab screens. Where a screen currently shows a count badge in that slot, keep the count (it also appears in the totals strip) unless the two collide on a narrow screen, in which case the count yields to the gear and the strip carries it alone.
- [ ] **Step 3:** Drop the Settings destination from both toolbars (native and fallback) — four destinations remain. `/settings` keeps its route and stays deep-link reachable.
- [ ] **Step 4:** Update `tests/floating-tab-bar.test.tsx` and any snapshot expecting five destinations.
- [ ] **Step 5: Gate + commit** — `feat(mobile): settings moves from the toolbar into screen headers`

---

### Task 5: G1 gate

**Files:** `docs/qa/mobile-mvp-checklist.md`, spec §3 status, `.superpowers/sdd/progress.md`

- [ ] QA lines: native toolbar renders with acid FAB and switches all four tabs · FAB opens the composer · Settings gear reachable from every tab and `/settings` still opens from a deep link · Home figures match reality (cross-check against Inventory and a batch dashboard) · next-run block appears only when something is scheduled and its countdown ticks · Free account sees the Pro pitch on Home · fresh install still routes Welcome → onboarding → Home · nothing hides under the toolbar at the end of long lists.
- [ ] Full gates; mark spec §3 shipped; ledger lines with commits and test count. Commit `chore(mobile): G1 QA + spec update — G1 complete`.
- [ ] Coordinator afterwards: whole-phase review → fixes → merge → `eas update` with the env-var + bundle-grep procedure (grep the published `.hbc` for the Supabase host and `Inventory`).

## Self-Review Notes

- **Spec coverage:** §2 probe → T0; §3 toolbar/FAB → T2; §3 Home content → T1+T3; §3 Settings move → T4; QA/docs → T5. G2 (solo items) and G3 (native components, gestures, motion) are separate plans by design — T2 step 4 explicitly marks the line G2 replaces.
- **Type consistency:** `Snapshot`/`snapshot`/`recentItems`/`nextScheduled` (T1) consumed only by T3; `TAB_BAR_CLEARANCE` re-exported unchanged from T2 and used by T3; `AppHead`'s new optional prop (T4) breaks no existing caller.
- **Riskiest area flagged for the reviewer:** T0's result is load-bearing for the entire phase, and T3 moves the home route again (F1 already moved it once) — the first-run gate and both deep-link paths are the things most likely to break silently.
