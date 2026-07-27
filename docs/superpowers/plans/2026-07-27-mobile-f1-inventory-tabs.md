# F1 — Inventory-First + Floating Tab Bar: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make inventory the home of the app behind a native floating tab bar, demote sessions to "Batches", and remove the free-tier item cap — mobile only, no schema change, ships OTA.

**Architecture:** Routes move under an `app/(tabs)/` group whose `_layout.tsx` renders `expo-router` Tabs with a custom floating bar (`GlassView` on iOS, solid pill on Android). The existing sessions screen relocates verbatim to the Batches tab; a new Inventory screen queries all items with pure, TDD'd filter/sort helpers in `lib/inventory.ts`. Free-tier gating is removed at the two call sites while `entitlements` keeps its schema.

**Tech Stack:** expo-router 57 Tabs, expo-glass-effect (installed, unused until now), @shopify/flash-list, drizzle useLiveQuery, NativeWind 4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-latag-phase-f-inventory-storefront-design.md` §2 is law.
- **JS-only** — no package.json/app.json changes (ships OTA). `expo-glass-effect` and `@expo/ui` are ALREADY in package.json; importing them is free.
- **No schema change.** The `sessions` table keeps its name; only UI copy says "Batch". `entitlements.logsUsed` column stays.
- **Behavior preservation is the bar**: every existing flow (Rapid Console save + photo bus, camera, item detail, sold, export/IG share, albums, session edit/schedule/reminders/map pins, sign-in, OTA check, deep links, notification taps) must work identically after the route move. Deep-link paths that already exist must keep resolving: `latag://session/{id}` (notification taps), `latag://auth/callback` (sign-in).
- Design: Warehouse Console tokens (`lib/theme.ts`), screen gutters `px-5`, rows `px-3 py-3.5`, 8pt rhythm, 44px+ targets, a11y labels on icon-only pressables, honest copy.
- Gates per task from `apps/mobile`: `pnpm test` green (282+, never shrinking) · `npx tsc --noEmit` 0 · `npx expo export --platform android` ok (delete `dist/` after). Commit per task with the plan's message; do NOT push (coordinator pushes/publishes).
- Branch: `feat/phase-f1-inventory-tabs`. Repo root path contains a space — quote it.

---

### Task 1: Inventory query helpers — `lib/inventory.ts` (TDD)

**Files:** Create `apps/mobile/lib/inventory.ts`, `apps/mobile/tests/inventory.test.ts`

**Interfaces:**
- Produces (Tasks 3–4 consume these exact names):
```ts
export type InvStatus = "all" | "available" | "sold";
export type InvSort = "newest" | "oldest" | "price-high" | "price-low";
export type InvFilter = { query: string; department: Department | "all"; status: InvStatus; sort: InvSort };
export const DEFAULT_FILTER: InvFilter;                                  // { query:"", department:"all", status:"all", sort:"newest" }
export function filterItems<T extends InvItem>(items: T[], f: InvFilter): T[];
export function inventoryTotals<T extends InvItem>(items: T[]): { count: number; available: number; sold: number; stockValue: number };
```
- `InvItem` is the structural minimum this module needs — define it locally, do NOT import the drizzle row type:
```ts
type InvItem = { brand: string; name: string | null; department: string; category: string;
                 status: "available" | "sold"; targetSellPrice: number; soldPrice: number | null; createdAt: Date };
```
- Rules: `query` matches case-insensitively against `brand`, `name`, and `category` (trimmed; empty = no filtering). `department:"all"` skips that filter. `status` filters on the row's `status`. Sorts: `newest`/`oldest` by `createdAt`; `price-high`/`price-low` by the **effective price** (`soldPrice ?? targetSellPrice`). Sorting must be stable and must NOT mutate the input array. `stockValue` = sum of `targetSellPrice` for `available` rows only (what's still on the shelf).

- [ ] **Step 1: Write the failing tests** — `apps/mobile/tests/inventory.test.ts`:

```ts
import { filterItems, inventoryTotals, DEFAULT_FILTER } from "../lib/inventory";

const it0 = (over: Partial<Parameters<typeof filterItems>[0][number]> = {}) => ({
  brand: "Carhartt", name: null, department: "tops", category: "Jacket",
  status: "available" as const, targetSellPrice: 850, soldPrice: null,
  createdAt: new Date("2026-07-01T00:00:00Z"), ...over,
});

test("empty query returns everything", () => {
  const rows = [it0(), it0({ brand: "Nike" })];
  expect(filterItems(rows, DEFAULT_FILTER)).toHaveLength(2);
});

test("query matches brand, name, and category case-insensitively", () => {
  const rows = [it0(), it0({ brand: "Nike", name: "Windbreaker" }), it0({ brand: "Levi's", category: "Jeans" })];
  expect(filterItems(rows, { ...DEFAULT_FILTER, query: "car" })[0].brand).toBe("Carhartt");
  expect(filterItems(rows, { ...DEFAULT_FILTER, query: "wind" })[0].brand).toBe("Nike");
  expect(filterItems(rows, { ...DEFAULT_FILTER, query: "JEANS" })[0].brand).toBe("Levi's");
  expect(filterItems(rows, { ...DEFAULT_FILTER, query: "  " })).toHaveLength(3);
});

test("department and status filters", () => {
  const rows = [it0(), it0({ department: "footwear" }), it0({ status: "sold", soldPrice: 700 })];
  expect(filterItems(rows, { ...DEFAULT_FILTER, department: "footwear" })).toHaveLength(1);
  expect(filterItems(rows, { ...DEFAULT_FILTER, status: "sold" })).toHaveLength(1);
  expect(filterItems(rows, { ...DEFAULT_FILTER, status: "available" })).toHaveLength(2);
});

test("price sorts use the effective price (soldPrice wins when sold)", () => {
  const rows = [
    it0({ brand: "A", targetSellPrice: 500 }),
    it0({ brand: "B", targetSellPrice: 900, status: "sold", soldPrice: 100 }),
    it0({ brand: "C", targetSellPrice: 700 }),
  ];
  expect(filterItems(rows, { ...DEFAULT_FILTER, sort: "price-high" }).map((r) => r.brand)).toEqual(["C", "A", "B"]);
  expect(filterItems(rows, { ...DEFAULT_FILTER, sort: "price-low" }).map((r) => r.brand)).toEqual(["B", "A", "C"]);
});

test("date sorts", () => {
  const rows = [
    it0({ brand: "old", createdAt: new Date("2026-01-01") }),
    it0({ brand: "new", createdAt: new Date("2026-07-01") }),
  ];
  expect(filterItems(rows, { ...DEFAULT_FILTER, sort: "newest" })[0].brand).toBe("new");
  expect(filterItems(rows, { ...DEFAULT_FILTER, sort: "oldest" })[0].brand).toBe("old");
});

test("does not mutate the input array", () => {
  const rows = [it0({ brand: "A" }), it0({ brand: "B", createdAt: new Date("2026-01-01") })];
  const snapshot = rows.map((r) => r.brand);
  filterItems(rows, { ...DEFAULT_FILTER, sort: "oldest" });
  expect(rows.map((r) => r.brand)).toEqual(snapshot);
});

test("totals: counts and stock value of AVAILABLE only", () => {
  const rows = [it0({ targetSellPrice: 500 }), it0({ targetSellPrice: 300 }),
                it0({ status: "sold", soldPrice: 900, targetSellPrice: 1000 })];
  expect(inventoryTotals(rows)).toEqual({ count: 3, available: 2, sold: 1, stockValue: 800 });
});

test("totals on an empty list", () => {
  expect(inventoryTotals([])).toEqual({ count: 0, available: 0, sold: 0, stockValue: 0 });
});
```

- [ ] **Step 2: Run and watch it fail** — `pnpm test tests/inventory.test.ts` → FAIL (`Cannot find module '../lib/inventory'`).
- [ ] **Step 3: Implement `lib/inventory.ts`** — pure module, no imports except the `Department` type from `./catalog`. Copy the array before sorting (`[...rows].sort(...)`).
- [ ] **Step 4: Run and watch it pass** — `pnpm test tests/inventory.test.ts` → PASS; then full `pnpm test` green.
- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/inventory.ts apps/mobile/tests/inventory.test.ts
git commit -m "feat(mobile): inventory query helpers — filter, sort, totals"
```

---

### Task 2: Tab group + floating glass tab bar

**Files:** Create `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/components/FloatingTabBar.tsx`; Move `apps/mobile/app/index.tsx` → `apps/mobile/app/(tabs)/batches.tsx`; Create placeholder `apps/mobile/app/(tabs)/index.tsx` and `apps/mobile/app/(tabs)/shop.tsx`; Move `apps/mobile/app/settings.tsx` → `apps/mobile/app/(tabs)/settings.tsx`; Modify `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Produces: route paths `/` (Inventory), `/batches`, `/shop`, `/settings`. **`/settings` keeps its exact path** (it's pushed from several screens) — moving the file into the group does not change its URL. Existing non-tab routes (`session/*`, `item/*`, `auth/*`, `onboarding`, `welcome`) stay where they are, outside the group.
- `<FloatingTabBar {...props} />` implements `BottomTabBarProps` from `@react-navigation/bottom-tabs` (re-exported through expo-router's Tabs).

- [ ] **Step 1: Create the tab group layout** — `apps/mobile/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from "expo-router";
import { FloatingTabBar } from "../../components/FloatingTabBar";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "#000" } }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Inventory" }} />
      <Tabs.Screen name="batches" options={{ title: "Batches" }} />
      <Tabs.Screen name="shop" options={{ title: "Shop" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Build the floating bar** — `apps/mobile/components/FloatingTabBar.tsx`. Requirements, all concrete:
  - Container: `position:absolute`, `left:20 right:20`, `bottom: insets.bottom + 12` (`useSafeAreaInsets`), `borderRadius: 28`, `overflow:"hidden"`, `flexDirection:"row"`, `height: 60`, border `1px` `COLORS.hairline`.
  - iOS: wrap contents in `GlassView` from `expo-glass-effect` (`import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect"`). Use it only when `Platform.OS === "ios" && isLiquidGlassAvailable()`; otherwise render a plain `View` with `backgroundColor: COLORS.surface1`. Verify the exact export names against `node_modules/expo-glass-effect` types before writing — if the API differs, use the installed one and note it in your report.
  - Each tab: `flex:1`, centered, `accessibilityRole="button"`, `accessibilityState={{ selected }}`, `accessibilityLabel` = the tab title, `onPress` → `navigation.navigate(route.name)` guarded by the standard `tabPress` event pattern (emit `tabPress`, respect `defaultPrevented`), `onLongPress` → `tabLongPress`.
  - Icon per route via `components/Icon.tsx`: `index`→`Package`, `batches`→`Stack`, `shop`→`Storefront`, `settings`→`GearSix`, size 22, color `COLORS.acid` when focused else `COLORS.inkFaint`. **Add any of these names missing from `Icon.tsx`'s map (verify each exists in `phosphor-react-native` exports first).**
  - Label under the icon: 10px `FONT.display`, `letterSpacing: 0.4`, uppercase, acid when focused else inkfaint, `marginTop: 3`.
  - Haptics on press: `Haptics.selectionAsync()` (matches existing Chip behavior).
- [ ] **Step 3: Move the screens with git so history is preserved**

```bash
cd "C:\Users\raroc\OneDrive\Desktop\Personal Project\Latag"
git mv apps/mobile/app/index.tsx apps/mobile/app/\(tabs\)/batches.tsx
git mv apps/mobile/app/settings.tsx apps/mobile/app/\(tabs\)/settings.tsx
```
Then fix every relative import inside both moved files (they gain one directory level: `../db/client` → `../../db/client`, etc.). `tsc` is the checklist here — it will name each broken path.

- [ ] **Step 4: Create the two new tab screens** — `apps/mobile/app/(tabs)/index.tsx` is a temporary placeholder for this task (Task 3 fills it): a `View` with the app header and the text "Inventory". `apps/mobile/app/(tabs)/shop.tsx` is the real F1 deliverable for that tab — an honest pre-F2 state: `AppHead title="Shop"`, a centered `ghostcard`-style block with `Storefront` icon, heading "Your shop isn't set up yet", body "Publish items from your inventory to a public page buyers can browse — coming in the next update.", and no CTA (nothing to tap yet; do not fake a button).
- [ ] **Step 5: Update the root layout** — `apps/mobile/app/_layout.tsx`: the `Stack` gains `<Stack.Screen name="(tabs)" options={{ headerShown: false }} />` as its first screen. Every other `Stack.Screen` entry (modals: `session/new`, `session/[id]/camera`, `item/[id]/sold`, `auth/sign-in`) stays untouched. **Do not touch** the migrations gate, fonts gate, splash logic, deep-link effect, notification effect, or OTA effect.
- [ ] **Step 6: Fix the first-run gate** — the redirect logic that lived in the old `app/index.tsx` (`decideStartRoute`, `AsyncStorage.multiGet`, the `checked` state) must now run in `apps/mobile/app/(tabs)/index.tsx` (the new home). Move it there verbatim in Task 3; for THIS task, put it in the placeholder so first-run still routes to `/welcome` or `/onboarding` correctly. Verify `router.replace("/")` from onboarding still lands on the Inventory tab.
- [ ] **Step 7: Regenerate typed routes** — new route files need `.expo/types/router.d.ts` regenerated or `tsc` will reject `/batches` and `/shop`. Run `npx expo start --offline` and kill it after ~15s (the established pattern in this repo), or run `npx expo export --platform android` which also regenerates them.
- [ ] **Step 8: Gate** — `pnpm test` green · `npx tsc --noEmit` 0 · `npx expo export --platform android` ok (delete `dist/`).
- [ ] **Step 9: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): tab navigation — floating glass bar, inventory/batches/shop/settings"
```

---

### Task 3: Inventory screen

**Files:** Modify `apps/mobile/app/(tabs)/index.tsx`; Create `apps/mobile/tests/inventory-screen.test.tsx`

**Interfaces:** Consumes `filterItems`, `inventoryTotals`, `DEFAULT_FILTER`, `InvFilter` (Task 1); `DEPARTMENTS` from `lib/catalog`; `captionSpecLine` for row subtitles; existing `Chip`, `Money`, `Badge`, `Icon`, `AppHead` components.

- [ ] **Step 1: Write the failing test** — `apps/mobile/tests/inventory-screen.test.tsx`. Follow the mocking pattern already used by `tests/sessions-screen.test.tsx` (read it first — it mocks `drizzle-orm/expo-sqlite`'s `useLiveQuery` and the db client). Assert: with 3 items where 1 is sold, the screen renders 3 rows; typing into search narrows to matching rows; tapping the "Sold" status chip shows only the sold row; the empty state renders its exact copy when there are no items at all.
- [ ] **Step 2: Run and watch it fail.**
- [ ] **Step 3: Build the screen.** Structure top to bottom:
  - First-run gate moved from Task 2's placeholder (verbatim: `AsyncStorage.multiGet(["latag.welcomed","latag.onboarded"])` → `decideStartRoute` → `router.replace`, with the `checked` state preventing a flash).
  - `AppHead title="Inventory"` with a right slot showing the item count `Badge`.
  - Totals strip under the header: `N items · M available · ₱X stock value` — 12px `inkfaint`, `tabular-nums`, `lineHeight 17`, from `inventoryTotals`.
  - Search field: `.field` spec (`h-[52px] rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px]`), placeholder "Search brand, name, category", `MagnifyingGlass` icon 16 `inkFaint` on the left, clear (`X`) button when non-empty, `accessibilityLabel="Search inventory"`.
  - Department chip row (horizontal `ScrollView`, `gap-2`, `mb-2.5`): "All" + the six `DEPARTMENTS` labels.
  - Status + sort row: three status `Chip`s (All/Available/Sold) on the left; on the right a sort `Chip` cycling `newest → price-high → price-low → oldest` whose label shows the current mode ("Newest", "₱ High", "₱ Low", "Oldest").
  - `FlashList` of rows — reuse the exact row markup from `app/session/[id]/index.tsx` (thumbnail 64px with brand-initial fallback, `brand · name` title, `category · condition · captionSpecLine` subtitle, `Money size="row"`, SOLD badge, `px-3 py-3.5` insets, hairline separator) so inventory and batch rows are visually identical. Row press → `router.push(\`/item/${item.id}\`)`.
  - `contentContainerStyle={{ paddingBottom: 96 }}` so the last row clears the floating bar.
  - Empty states, both `ghostcard` style (dashed hairline, radius 12, centered 13px `inkfaint`): no items at all → "No items yet — start a batch to log your first piece."; filters matched nothing → "No items match these filters."
- [ ] **Step 4: Run tests to green; full suite green.**
- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(tabs\)/index.tsx apps/mobile/tests/inventory-screen.test.tsx
git commit -m "feat(mobile): inventory screen — search, filters, sort, totals"
```

---

### Task 4: Batches vocabulary + free-tier cap removal

**Files:** Modify `apps/mobile/app/(tabs)/batches.tsx`, `apps/mobile/app/session/new.tsx`, `apps/mobile/app/session/edit.tsx`, `apps/mobile/app/session/[id]/index.tsx`, `apps/mobile/app/session/[id]/add.tsx`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/components/GoProSheet.tsx`, `apps/mobile/lib/notifications.ts`, `apps/mobile/lib/repo.ts`, `apps/mobile/tests/repo.test.ts`, `apps/mobile/lib/caption.ts` (only if it says "session")

**Interfaces:** `addItem` keeps its signature and return shape (`{ item, logsRemaining }`) so no caller breaks; it simply never throws `FreeTierExhaustedError` any more. `consumeLog` stays exported from `lib/entitlements.ts` (unused by the save path, still counting) — do NOT delete it or the column.

- [ ] **Step 1: Vocabulary sweep.** Replace user-visible "Session"/"session" with "Batch"/"batch" across the files above — headers, tabs ("Sessions | Scheduled" → "Batches | Scheduled"), buttons ("New session" → "New batch"), toasts ("Session started" → "Batch started"), empty states, notification copy in `lib/notifications.ts`, and the Settings rows. **Do NOT rename**: the `sessions` table, `sessionId` columns, file paths, route names, function names (`startScheduledSession`, `addSession`), or the `latag://session/{id}` deep link. Run `grep -rn "[Ss]ession" apps/mobile/app apps/mobile/components` and justify every remaining hit as code-not-copy.
- [ ] **Step 2: Failing test for the cap removal** — in `apps/mobile/tests/repo.test.ts`, add: seeding entitlements with `logsUsed = FREE_LOG_LIMIT` and `pro = false`, then calling `addItem` **succeeds** and returns an item (previously it threw `FreeTierExhaustedError`). Run it: FAIL.
- [ ] **Step 3: Remove the gate** — in `lib/repo.ts`'s `addItem`, drop the `consumeLog` call that can throw and compute `logsRemaining` without gating (keep returning the field; callers destructure it). Run: PASS.
- [ ] **Step 4: Remove the UI gate** — `app/session/[id]/add.tsx`: delete the `FreeTierExhaustedError` catch branch, the `goPro` state, the `<GoProSheet>` render, and the "N free logs left" pill/badge. Keep `GoProSheet.tsx` as a component (F2 reuses it for the publish gate) but stop importing it here.
- [ ] **Step 5: Settings copy** — the licence row for free users reads `Free` / subtitle "Unlimited local inventory · Pro unlocks your shop" instead of "Free — 20 item logs". Pro row unchanged.
- [ ] **Step 6: Gate + commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): batches vocabulary, unlimited free inventory"
```

---

### Task 5: F1 gate — QA, docs, ledger

**Files:** Modify `docs/qa/mobile-mvp-checklist.md`, `docs/superpowers/specs/2026-07-27-latag-phase-f-inventory-storefront-design.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: QA section "Phase F1"** — add these lines:
  - Floating bar: renders above the safe area on a gesture-nav phone, all four tabs switch, active state is acid, nothing is clipped behind it at the bottom of long lists
  - Inventory: search narrows across brand/name/category; department + status chips filter; sort cycles; totals line matches reality; tapping a row opens item detail
  - Batches tab: every pre-F1 flow still works (create batch, bale cost, capital recovery, map pin, schedule + reminder fires, Start now, edit, delete, export/IG share)
  - Free tier: log 25+ items on a Free account without any paywall; Settings shows "Unlimited local inventory"
  - First run (clear data): still lands Welcome → onboarding → Inventory tab
  - Notification tap on a scheduled batch still opens that batch; email sign-in link still returns to the app
- [ ] **Step 2: Mark spec §2 SHIPPED** with today's date; add a one-line note that DB `sessions` = UI "Batches".
- [ ] **Step 3: Ledger** — one line per task with commit hashes and the final test count.
- [ ] **Step 4: Full gate** — `pnpm test`, `npx tsc --noEmit`, `npx expo export --platform android`.
- [ ] **Step 5: Commit** — `chore(mobile): F1 QA + spec update — F1 complete`
- [ ] **Step 6 (coordinator, not this task):** whole-phase review → fixes → merge to master → `eas update --channel preview` using the ledger's env-var + bundle-grep procedure (grep the published `.hbc` for the Supabase host **and** the string `Inventory`).

## Self-Review Notes

- **Spec §2 coverage:** floating bar w/ iOS glass + Android fallback → T2; four tabs → T2; Inventory search/filter/sort → T1+T3; Batches preserved verbatim → T2 (move) + T4 (copy only); free cap removal + GoPro relocation → T4; copy updates → T4; QA/docs → T5. ✓
- **Type consistency:** `InvFilter`/`DEFAULT_FILTER`/`filterItems`/`inventoryTotals` (T1) consumed in T3; `FloatingTabBar` (T2) consumed by `(tabs)/_layout.tsx`; `addItem`'s return shape unchanged so T4 breaks no callers. ✓
- **Riskiest area flagged for the reviewer:** the route move in T2 — first-run gate relocation, `/settings` path stability, modal registrations, and both deep-link paths (`latag://session/{id}`, `latag://auth/callback`) are the things most likely to break silently and are explicitly called out in T2 steps 5–6 and T5's QA lines.
