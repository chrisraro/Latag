# G2 + G3 — Solo Items, Native Components, Gestures & Motion: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD every logic module (RED first). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let an item exist without a batch, then modernise the interaction layer — native pickers/sheets/search where native wins, swipe actions, pull-to-refresh, and Reanimated motion.

**Architecture:** G2 is a schema change plus the flows that depend on it, kept deliberately small because it touches the riskiest migration in the app. G3 is additive UI: each native component lands behind the same capability-check + fallback pattern G1 established for the toolbar, so no screen can be bricked by a missing native view.

**Tech Stack:** @expo/ui 57.0.4, react-native-gesture-handler 2.32, react-native-reanimated 4.5, RN `RefreshControl` — all installed and in the v1.1.0 binary.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-latag-phase-g-mobile-modernization-design.md` §4–§5 is law.
- **JS-only — no package.json/app.json changes.** Everything needed ships in the installed binary.
- **Every `@expo/ui` component follows the G1 pattern**: verify the export exists in the installed package before importing, wrap in `Host`, render behind a capability check with a custom fallback. A missing native view must degrade, never crash.
- **Theming reality (learned in G0):** the universal `Switch` has NO colour props; theming is per-platform via `modifiers`. Before adopting any component, check whether it can carry the Warehouse Console tokens. If it cannot and it sits somewhere identity matters, keep the custom control and say so in the report — do not ship stock-Material purple next to acid green.
- **Custom stays custom:** item rows, `Money`, the price wheels, `AppHead`, session/shop cards. These carry the brand.
- Design: tokens from `lib/theme.ts`; screens `px-5`, rows `px-3 py-3.5`, cards 18px interiors, 44px targets, a11y labels, explicit `lineHeight` on ≤13px text.
- Gates per task from `apps/mobile`: `pnpm test` green (549+, never shrinking) · `npx tsc --noEmit` 0 · `npx expo export --platform android` ok (delete `dist/`). Commit per task; do NOT push.
- Branch: `feat/phase-g2-g3`. Repo root path contains a space — quote it.

---

## G2 — Solo items

### Task 1: Make the batch link optional (the risky migration)

**Files:** Modify `apps/mobile/db/schema.ts`; generate `apps/mobile/drizzle/0005_*.sql`; Modify `apps/mobile/tests/schema.test.ts`, `apps/mobile/lib/repo.ts`, `apps/mobile/tests/repo.test.ts`

**Interfaces:** `items.sessionId` becomes `text("session_id").references(() => sessions.id)` — the `.notNull()` is dropped. `AddItemInput.sessionId` becomes `string | null`. Everything else is unchanged.

**This is the single most dangerous change in Phase G.** Dropping NOT NULL forces SQLite to rebuild the `items` table, and drizzle-kit produced a BROKEN rebuild for this exact table in E1 — its `INSERT … SELECT` referenced columns that did not exist yet, which would have destroyed real inventory. The user now has real data on their phone.

- [ ] **Step 1: Write the failing zero-loss test FIRST.** Extend `tests/schema.test.ts`: apply migrations up to the current head, insert a **fully populated** item (every column: department, name, all spec fields, sizeNote, publishedAt, shopCode, photoSync, soldPrice, soldAt, individualCost) plus a `photos` child row and a `publish_queue` row referencing it, then apply the new migration and assert **every field round-trips identically** and both child rows survive. Run it — it must fail only because the new migration does not exist yet.
- [ ] **Step 2: Edit the schema** and run `npx drizzle-kit generate`.
- [ ] **Step 3: READ THE GENERATED SQL LINE BY LINE.** Confirm the new-table definition lists every column currently in `items`, in order, and that the `INSERT … SELECT` copies each one from the old table and references NO column that does not already exist. If it is wrong, hand-patch it and say so loudly in your report. Do not run it until you have read it.
- [ ] **Step 4:** Run the test → GREEN. Then the full suite.
- [ ] **Step 5: Repo accepts null.** `addItem` takes `sessionId: string | null`; `updateItem` can clear it. Add a test: an item created with `sessionId: null` saves, reads back null, and `deleteSession` never touches it.
- [ ] **Step 6: Commit** — `feat(mobile): items no longer require a batch`

### Task 2: Quick-add flow and "no batch" surfaces

**Files:** Modify `apps/mobile/app/session/[id]/add.tsx` (accept no batch), `apps/mobile/components/NativeTabBar.tsx` + `apps/mobile/components/FloatingTabBar.tsx` (FAB target), `apps/mobile/app/item/[id]/index.tsx`, `apps/mobile/app/(tabs)/inventory.tsx`, `apps/mobile/lib/inventory.ts` (+ tests)

- [ ] **Step 1:** Make the Rapid Console usable with no `sessionId` — reachable at `/item/new` (a new route re-exporting the console in "no batch" mode) so the FAB no longer needs to invent a batch. Header reads "New item"; everything else (departments, wheels, brand picker, photos, save) behaves identically. Saving returns to where the user came from.
- [ ] **Step 2:** Replace the G1 stopgap in BOTH tab bars — the FAB now routes to `/item/new`. Delete the "most recent batch" fallback and its comment.
- [ ] **Step 3:** Item detail shows "No batch" (inkfaint) where the batch name renders today, with no navigation affordance.
- [ ] **Step 4:** `lib/inventory.ts` gains a `batch: "all" | "none"` filter dimension (TDD: filters to items with a null `sessionId`), surfaced in Inventory as a **Loose items** chip.
- [ ] **Step 5: Commit** — `feat(mobile): add items straight to inventory, no batch required`

---

## G3 — Native components, gestures, motion

### Task 3: Pull-to-refresh on all four tabs

**Files:** Modify `apps/mobile/app/(tabs)/home.tsx`, `inventory.tsx`, `batches.tsx`, `shop.tsx`; Create `apps/mobile/lib/refresh.ts` + `apps/mobile/tests/refresh.test.ts`

**Interfaces:** `export function useRefresh(onRefresh: () => Promise<void>): { refreshing: boolean; onRefresh: () => void }` — guards against overlapping refreshes and always clears the flag, even when the callback throws.

- [ ] TDD the hook's contract (no overlap; flag always clears; a throwing callback is swallowed). Wire `RefreshControl` (RN core, `tintColor` = acid) into each tab's list/scroll view. Refresh means: re-read local queries and, where a shop exists, `kickSync` the publish queue. It must work offline — a local re-read is the honest refresh for an offline-first app.
- [ ] Commit — `feat(mobile): pull to refresh across the tabs`

### Task 4: Swipe actions on inventory and batch rows

**Files:** Create `apps/mobile/components/SwipeRow.tsx`, `apps/mobile/lib/swipe-actions.ts` + tests; Modify `apps/mobile/app/(tabs)/inventory.tsx`, `apps/mobile/app/(tabs)/batches.tsx`

- [ ] `lib/swipe-actions.ts` (pure, TDD): given an item, return the actions available (`markSold` only when available; `undoSold` when sold; `publish`/`unpublish` only when a shop exists and the user is Pro). No component may decide this inline.
- [ ] `SwipeRow` built on `react-native-gesture-handler`'s `Swipeable`/`ReanimatedSwipeable` (verify which the installed 2.32 exports before writing). Left swipe = primary action (acid), right = secondary/destructive (danger). Springs, not linear. 44px minimum action width.
- [ ] **Destructive actions require confirmation or undo** — deleting or unpublishing on a stray gesture is unacceptable. Use the existing toast with an undo affordance, or a confirm sheet.
- [ ] Commit — `feat(mobile): swipe actions on inventory and batch rows`

### Task 5: Native filter & sort controls

**Files:** Create `apps/mobile/components/native/Segmented.tsx`, `apps/mobile/components/native/SearchField.tsx` (each with its custom fallback); Modify `apps/mobile/app/(tabs)/inventory.tsx`

- [ ] Verify `SingleChoiceSegmentedButtonRow` / `SegmentedButton` (Compose) and the SwiftUI `Picker` equivalent in the installed package, including whether they accept colours. Wrap each in the capability-check + fallback pattern; the fallback is today's `Chip` row, which already works.
- [ ] Status and sort become segmented controls; search becomes the native `SearchBar` where it themes acceptably, otherwise stays as-is. Department chips stay custom (six options overflow a segmented control).
- [ ] **If a control cannot carry the design tokens, keep the custom one and report why.** Native for its own sake is not the goal.
- [ ] Commit — `feat(mobile): native segmented filters and search on inventory`

### Task 6: Motion

**Files:** Create `apps/mobile/lib/motion.ts` (shared durations/easings, reduced-motion aware); Modify list screens and the FAB

- [ ] `lib/motion.ts` exports the standard durations/easings plus a `useReducedMotion` wrapper (Reanimated exposes one — verify the export in the installed version). Every animation below reads from it; nothing hardcodes a duration.
- [ ] List entrance stagger on Inventory and Home's recent strip (`FadeInDown`, ≤200ms, capped stagger so a 500-item list does not animate forever — only the first screenful).
- [ ] FAB press → composer transition; tab-switch cross-fade.
- [ ] **Respect reduced motion**: when enabled, animations become instant, not merely faster. No animation may block input or delay a save.
- [ ] Commit — `feat(mobile): motion pass — entrance stagger, FAB transition, reduced-motion aware`

### Task 7: G2+G3 gate

**Files:** `docs/qa/mobile-mvp-checklist.md`, spec §4/§5 status, `.superpowers/sdd/progress.md`

- [ ] QA lines: existing items survive the migration with every field intact (check a published item's code and photos specifically) · FAB adds an item with no batch and it appears in Inventory · "Loose items" filter works · item detail shows "No batch" · pull-to-refresh works on all four tabs including offline · swipe to mark sold works and undo restores · destructive swipes always confirm · native filters render (or the fallback does, without visual breakage) · animations respect the OS reduced-motion setting.
- [ ] Full gates; mark spec §4/§5 shipped; ledger. Commit `chore(mobile): G2+G3 QA + spec update — Phase G complete`.
- [ ] Coordinator: whole-phase review → fixes → merge → `eas update` with the env-var + bundle-grep procedure.

## Self-Review Notes

- **Spec coverage:** §4 solo items → G2 T1–T2; §5 native components → T5, gestures → T4, pull-to-refresh → T3, motion → T6; QA/docs → T7.
- **Type consistency:** `AddItemInput.sessionId` widening (T1) is consumed by T2; `useRefresh` (T3), `swipeActionsFor` (T4) and `lib/motion.ts` (T6) are each consumed only by their own task's screens; `TAB_DESTINATIONS`/`TAB_BAR_CLEARANCE` remain G1's exports, untouched.
- **Riskiest area flagged for the reviewer:** G2 Task 1's table rebuild against real user data — the zero-loss test with populated child rows is the gate, and the generated SQL must be read before it runs.
