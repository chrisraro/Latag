# E1 — Full Ukay Catalog: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Latag from tops-only to all ukay departments (Bottoms, Dresses, Footwear, Bags, Accessories) with per-department specs, a bundled PH brand database with user-created brands, and separate item name vs brand — pure JS, ships OTA.

**Architecture:** A pure `lib/catalog.ts` module is the single source of truth for departments/types/spec-fields; schema gains nullable per-measurement columns via an additive (table-rebuild) migration; brand suggestions are a pure ranking function over seed JSON + local `user_brands` + recents; UI (console, detail, rows, captions) renders whatever catalog.ts dictates — no department knowledge outside it.

**Tech Stack:** Expo SDK 57, drizzle-orm/expo-sqlite + drizzle-kit (driver expo), better-sqlite3 test harness, jest-expo, NativeWind 4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-15-latag-phase-e-catalog-sessions-media-design.md` §2 — taxonomy/spec table values are verbatim law.
- Offline-first: NO network code anywhere in E1. Brand seed is bundled JSON.
- JS-only: do NOT touch package.json deps, app.json, or native config (this sub-phase ships OTA).
- Existing items must survive migration untouched as department `tops` (ptp/length preserved); ZERO data loss. `items.brand` stays denormalized TEXT.
- Wheel component API and its measured-width/custom-amount logic must not regress. 5-second logging path: department segment + type chips + 2 wheels max on the fast path.
- Design tokens/fonts per lib/theme.ts; spacing per current 8pt rhythm (screen px-5, rows px-3 py-3.5, cards 18px interiors); FieldLabel for section labels; 44px targets.
- Gates per task from apps/mobile: `pnpm test` green (89 tests grow, never shrink) · `npx tsc --noEmit` · `npx expo export --platform android` ok (delete dist/) for tasks touching bundling-reachable code. Commit per task, do NOT push (coordinator pushes).
- Repo root: `C:\Users\raroc\OneDrive\Desktop\Personal Project\Latag` (quote the space). Branch: `feat/phase-e1-catalog`.

---

### Task 1: Taxonomy module — lib/catalog.ts (TDD)

**Files:** Create `apps/mobile/lib/catalog.ts`, `apps/mobile/tests/catalog.test.ts`

**Interfaces:**
- Produces (later tasks import these exact names):
```ts
export type Department = "tops" | "bottoms" | "dresses" | "footwear" | "bags" | "accessories";
export type SpecKey = "ptpInches"|"lengthInches"|"sleeveInches"|"waistInches"|"inseamInches"|"riseInches"|"legOpeningInches"|"shoeSizeUs"|"insoleCm"|"widthInches"|"heightInches"|"depthInches"|"strapDropInches";
export type SpecField = { key: SpecKey; label: string; short: string; unit: "in"|"cm"|"US"; wheel: { min: number; max: number; step: number }; extra: boolean };
export const DEPARTMENTS: { key: Department; label: string }[];
export function typesFor(d: Department): string[];
export function specFieldsFor(d: Department): SpecField[];        // key specs first (extra:false), then extras
export function captionSpecLine(item: Pick<Item, "department"|SpecKey|"sizeNote">): string; // "" when nothing set
export function specRowsFor(item: ...same...): { k: string; v: string }[]; // only non-null specs, detail-screen rows
```
- Values (verbatim from spec §2): tops types `Tee, Polo, Longsleeve, Jersey, Crewneck, Sweater, Hoodie, Jacket`; bottoms `Jeans, Trousers, Cargo, Shorts, Skirt`; dresses `Dress, Jumpsuit`; footwear `Sneakers, Boots, Sandals, Leather`; bags `Backpack, Shoulder, Tote, Sling, Duffel`; accessories `Cap, Belt, Scarf, Beanie, Watch, Eyewear`.
- Key specs / extras + wheels: tops PTP(short "PTP", 14–36, step 0.5) · Length("L", 20–36, 0.5), extra Sleeve("SL", 5–30, 0.5); bottoms Waist("W", 24–46, 1) · Inseam("INS", 24–36, 0.5), extras Rise("RISE", 8–16, 0.5), Leg opening("LEG", 5–12, 0.5); dresses PTP · Length(30–60, 0.5), extra Waist; footwear US size("US", 4–14, 0.5, unit "US") · Insole("CM", 20–32, 0.5, unit "cm"), extra none (width label goes in sizeNote); bags Width("W", 6–30, 0.5) · Height("H", 6–24, 0.5), extras Depth("D", 2–12, 0.5), Strap drop("DROP", 5–30, 0.5); accessories: `specFieldsFor` returns `[]` (one-size; sizeNote covers it).
- Caption lines: tops/dresses `PTP 22" · L 27"`; bottoms `W 32" · INS 30"` (+` · RISE 10.5"` when set); footwear `US 9.5 · 25.5 cm`; bags `W 14" · H 11"` (+depth/drop when set); accessories → sizeNote or `One size`.

- [ ] **Step 1: failing tests** — `tests/catalog.test.ts`: DEPARTMENTS has 6 entries tops-first; `typesFor("bottoms")` exact array; `specFieldsFor("tops")` keys `["ptpInches","lengthInches","sleeveInches"]` with extra flags `[false,false,true]`; `specFieldsFor("accessories")` is `[]`; caption cases per department incl. footwear formatting `US 9.5 · 25.5 cm`, bottoms with+without rise, accessories `One size` fallback and sizeNote passthrough; `specRowsFor` skips nulls and uses full labels (`Pit-to-pit`, `Waist`, `US size`…). Use `formatInches` from lib/format for inch rendering (consistency with existing captions).
- [ ] **Step 2: run — expect FAIL (module not found).**
- [ ] **Step 3: implement lib/catalog.ts** — a `const CATALOG: Record<Department, { label; types; specs: SpecField[] }>` literal + the four functions reading it. No side effects, no imports beyond `formatInches` + `Item` type.
- [ ] **Step 4: run — PASS. Full suite green.**
- [ ] **Step 5: commit** `feat(mobile): catalog taxonomy module — departments, types, spec fields, caption lines`

---

### Task 2: Schema migration — new columns, nullable ptp/length, user_brands (TDD on harness)

**Files:** Modify `apps/mobile/db/schema.ts`; generate `apps/mobile/drizzle/0001_*.sql` (`npx drizzle-kit generate` from apps/mobile); Modify `apps/mobile/drizzle/migrations.js` (regenerated); Test `apps/mobile/tests/schema.test.ts` (extend)

**Interfaces:**
- `items` += `department: text("department").notNull().default("tops")`, `name: text("name")`, and REAL nullable: `sleeveInches, waistInches, inseamInches, riseInches, legOpeningInches, shoeSizeUs, insoleCm, widthInches, heightInches, depthInches, strapDropInches` (snake_case column names), `sizeNote: text("size_note")`; `ptpInches`/`lengthInches` become **nullable** (drop `.notNull()`).
- New table `userBrands` = `sqliteTable("user_brands", { id: text("id").primaryKey(), name: text("name").notNull(), createdAt: integer("created_at", { mode: "timestamp" }).notNull() })` + `export type UserBrand`.

- [ ] **Step 1: failing migration-integrity test** in tests/schema.test.ts (uses `makeTestDb()` harness which runs all migrations): insert an item WITHOUT department/name (old shape) → select → `department === "tops"`, `name === null`, `waistInches === null`, ptp/length intact; insert a bottoms item with `ptpInches: null, waistInches: 32` succeeds; `user_brands` accepts a row. (RED because columns don't exist.)
- [ ] **Step 2: run — FAIL (no such column).**
- [ ] **Step 3: edit schema.ts; run `npx drizzle-kit generate`** — drizzle emits a table-rebuild migration for the NOT NULL drop (`new table → INSERT SELECT → drop → rename`). READ the generated SQL and verify the INSERT SELECT copies every existing column; the harness test is the proof.
- [ ] **Step 4: run — PASS; whole suite green (repo tests still pass — old addItem signature untouched so far).**
- [ ] **Step 5: commit** `feat(mobile): schema — departments, item name, per-department specs, user_brands`

---

### Task 3: Repo layer — department-aware writes (TDD)

**Files:** Modify `apps/mobile/lib/repo.ts`, `apps/mobile/tests/repo.test.ts`

**Interfaces:**
- `addItem`/`updateItem` input type gains `department: Department`, `name?: string | null`, and all SpecKey fields optional. Produces: writes ONLY the department's own spec keys (from `specFieldsFor`), **nulls every other measurement column** (so switching department on edit can't leave stale specs), trims `name` to null when empty. consumeLog/photo/transaction behavior unchanged.

- [ ] **Step 1: failing tests**: add a bottoms item with `waistInches: 32, inseamInches: 30, ptpInches: 22` (bogus cross-field) → stored row has waist/inseam set, `ptpInches === null`; edit that item to footwear with `shoeSizeUs: 9.5, insoleCm: 25.5` → waist/inseam now null; `name: "  "` → null; `name: "Detroit Jacket"` stored. Existing repo tests keep passing with `department: "tops"` added to fixtures.
- [ ] **Step 2: FAIL** → **Step 3: implement** (build a `specColumnValues(department, input)` helper in repo.ts that maps all 13 SpecKeys to value-or-null) → **Step 4: PASS, suite green** → **Step 5: commit** `feat(mobile): repo — department-aware spec writes, optional item name`

---

### Task 4: Brand research + seed data (web research; validated artifact)

**Files:** Create `apps/mobile/data/brands.json`, `apps/mobile/tests/brands-data.test.ts`

**Interfaces:** JSON array of `{ "name": string, "tier": "core" | "common" }`. 400–600 entries. `tier: "core"` = the ~120 highest-frequency ukay/thrift PH labels (rank boost later).

- [ ] **Step 1: failing validation test**: import the JSON (jest resolves .json natively); assert `Array.isArray`, length `>= 400 && <= 650`, every entry has non-empty trimmed `name` and tier in {core,common}, case-insensitive names unique, no name longer than 40 chars.
- [ ] **Step 2: research** (this task's implementer uses the firecrawl web-research skills): sweep sources for brands actually traded in the PH ukay/thrift/resell scene — searches like "ukay ukay brands to look for", "thrift finds Philippines brands", PH streetwear resell groups coverage, Grailed/Depop most-listed brands, Japanese surplus/select labels (Uniqlo, GU, Comme des Garçons, Issey Miyake, Beams, United Arrows, Nanamica…), outdoor (Arc'teryx, Patagonia, The North Face, Columbia, Montbell, Salomon…), workwear/denim (Carhartt, Dickies, Levi's, Wrangler, Edwin, Evisu…), sportswear (Nike, Adidas, Puma, Asics, Mizuno, Kappa, Umbro, Fila, Champion…), skate/street (Stüssy, Supreme, Thrasher, Vans, Obey…), preppy/mall (Polo Ralph Lauren, Tommy Hilfiger, GAP, Old Navy, Abercrombie, Aeropostale, American Eagle…), designer/bag/shoe houses relevant to ukay bags/shoes (Coach, Kate Spade, Longchamp, Dr. Martens, Birkenstock, Timberland, Clarks…). Dedupe, normalize display casing (brand's own casing), mark ~120 as core.
- [ ] **Step 3: write brands.json, run validation — PASS.** Also `pnpm test` whole suite + tsc.
- [ ] **Step 4: commit** `feat(mobile): PH ukay brand seed — ~N curated labels (web-researched)` (N = actual count)

---

### Task 5: Brand suggestion engine — lib/brands.ts (TDD)

**Files:** Create `apps/mobile/lib/brands.ts`, `apps/mobile/tests/brands.test.ts`

**Interfaces:**
- Produces:
```ts
export type BrandSuggestion = { name: string; source: "recent" | "custom" | "seed" };
export function suggestBrands(query: string, pools: { recents: string[]; custom: string[]; seed: { name: string; tier: "core"|"common" }[] }, limit?: number): BrandSuggestion[];
export function addUserBrand(db: DB, name: string): { created: boolean; name: string };  // trims; nocase dedupe vs user_brands AND seed; returns existing casing when duplicate
export function listUserBrands(db: DB): string[];
```
- Ranking: empty query → recents (order kept), then custom (A→Z), then core-tier seed (A→Z), capped at `limit` (default 12). Non-empty query (case-insensitive): prefix matches before substring matches; within each: recents > custom > seed-core > seed-common; dedupe by nocase name keeping the highest-priority source. `addUserBrand` uses the better-sqlite3-compatible drizzle API like repo.ts.

- [ ] **Step 1: failing tests** — cover: empty query composition; prefix beats substring (`"car"` → Carhartt before Marc by Marc); recents win dedupe (recent "nike" vs seed "Nike" → one entry, source "recent"); limit; addUserBrand creates then dedupes case-insensitively against both pools; listUserBrands A→Z.
- [ ] **Step 2: FAIL** → **Step 3: implement** (pure function + two db helpers) → **Step 4: PASS, suite green** → **Step 5: commit** `feat(mobile): brand suggestion engine — ranked offline search + user brands`

---

### Task 6: BrandPickerSheet + name field in the Rapid Console

**Files:** Create `apps/mobile/components/BrandPickerSheet.tsx`; Modify `apps/mobile/app/session/[id]/add.tsx`

**Interfaces:**
- Consumes: `suggestBrands`/`addUserBrand`/`listUserBrands` (Task 5), seed JSON import, existing `recentBrands` computation in add.tsx (pass in as `recents`).
- Produces: `<BrandPickerSheet visible value recents onPick={(name)=>} onClose />` — RN Modal sheet matching existing sheet chrome (grab 44×4 #3A3A3A, title 19 FONT.display "Brand", search field `.field` spec h-[52px] radius 14 surface2 px-4 with autoFocus, suggestion rows px-3 py-3.5 hairline-separated: name 15 semibold + source tag 11 inkfaint on the right ("recent"/"yours"/"" for seed), and when no exact nocase match a leading acid row `+ Add "query"` → `addUserBrand` then `onPick`). 44px targets, a11y labels.

**Console changes (add.tsx):**
- [ ] BRAND section keeps the recent-brand chips row (tap = instant pick, zero typing); the existing brand text input becomes a Pressable field showing the chosen brand (or placeholder "Search brands") that opens BrandPickerSheet.
- [ ] NEW optional field directly below: FieldLabel `ITEM NAME · OPTIONAL` + plain TextInput (`.field` spec, placeholder `e.g. Detroit Jacket`, maxLength 60) bound to new `name` state, passed through save to repo. Edit mode prefills it.
- [ ] Save validation unchanged (brand still required; name never required). All double-tap guards/toasts/GoPro flow untouched.
- [ ] **Gate + commit** `feat(mobile): brand picker sheet + optional item name in console`

---

### Task 7: Rapid Console department adaptivity

**Files:** Modify `apps/mobile/app/session/[id]/add.tsx`

**Interfaces:** Consumes `DEPARTMENTS/typesFor/specFieldsFor` (Task 1), repo (Task 3). State: `department: Department` (default "tops"; edit mode derives from item), `specs: Partial<Record<SpecKey, number>>`, `sizeNote: string`.

- [ ] Department segment row under the AppHead: the `.seg` segmented control style from session/new.tsx (surface2 pill p-1 gap-1, options h-9 13px FONT.display, active acid) — 6 options, horizontally scrollable ScrollView if they overflow.
- [ ] CATEGORY chips = `typesFor(department)`; switching department resets category to first type and CLEARS `specs` state (repo also guards — belt and suspenders).
- [ ] Spec wheels render from `specFieldsFor(department)`: non-extra fields as the existing paired Wheel rows (labels via FieldLabel with `·` separators like today's `PIT-TO-PIT · LENGTH`); `extra:true` fields behind a collapsed Pressable row `+ More specs` (FieldLabel-styled, chevron) that expands to additional wheels. Footwear insole wheel uses cm labels; US-size wheel shows halves (9.5). Accessories: no wheels; show a single optional `.field` TextInput `SIZE NOTE` bound to sizeNote.
- [ ] Save passes `department`, mapped spec values, `sizeNote` to repo. Edit mode prefills all from the item.
- [ ] Free-logs pill, photos, cost/price wheels, save flow untouched. Wheel component itself NOT modified.
- [ ] **Gate + commit** `feat(mobile): rapid console adapts to all ukay departments`

---

### Task 8: Captions, item detail, list rows per department

**Files:** Modify `apps/mobile/lib/caption.ts` + `apps/mobile/tests/caption.test.ts`, `apps/mobile/app/item/[id]/index.tsx`, `apps/mobile/app/session/[id]/index.tsx`, `apps/mobile/app/session/[id]/export.tsx`

**Interfaces:** Consumes `captionSpecLine`/`specRowsFor` (Task 1).

- [ ] **TDD caption.ts**: failing tests first — the per-item caption block uses `Brand · Name` as the title line when `name` set (else brand alone), and the spec segment comes from `captionSpecLine` (add cases: bottoms item renders `W 32" · INS 30"`, footwear `US 9.5 · 25.5 cm`, accessories with sizeNote, tops unchanged vs existing snapshot expectations). Update only assertions that encoded tops-only behavior; IG format contract (sizes/condition/prices/claim rules) otherwise unchanged.
- [ ] Item detail: title = brand; if `name`, an italic-free `Name` KV row appears first; spec rows = `specRowsFor(item)` replacing the hardcoded Pit-to-pit/Length rows (Brand/Category/Condition/Cost/Price rows stay; Category shows `Dept · Type` e.g. `Bottoms · Jeans`).
- [ ] Dashboard + export rows subtitle: replace hardcoded `PTP x · L y` with `captionSpecLine(item)` (already compact) after `category · condition`; title shows `brand` + ` · name` when present (ellipsized, name in inkdim).
- [ ] **Gate + commit** `feat(mobile): per-department captions, detail rows, list subtitles`

---

### Task 9: E1 gate — QA, docs, ledger

**Files:** Modify `docs/qa/mobile-mvp-checklist.md`, spec §2 status line, `.superpowers/sdd/progress.md`

- [ ] QA section "Phase E1": log one item per department end-to-end (console → dashboard → detail → sold) verifying correct wheels/rows/captions; brand search hits seed + recents; add a custom brand offline → suggested next time; name renders as `Brand · Name` everywhere; EXISTING pre-migration items still open/edit/export correctly as Tops; IG caption per department matches format.
- [ ] Full gates; spec §2 marked SHIPPED; ledger lines per task. Commit `chore(mobile): E1 QA + spec update — E1 complete`.
- [ ] Coordinator (not this task): whole-sub-phase review → fixes → merge → `eas update` publish (with env-var + bundle-string verification procedure from the ledger).

## Self-Review Notes

- **Spec coverage §2:** taxonomy table → T1; schema/migration/zero-loss → T2; repo nulling → T3; seed research/size/tiers → T4; picker + user brands + recents → T5/T6; name field separate → T6 (+T8 display); console adaptivity + expander + one-size → T7; captions/detail/rows per dept → T8; existing-items migration QA → T9. ✓
- **Type consistency:** `Department`/`SpecKey`/`SpecField`/`specFieldsFor`/`captionSpecLine`/`specRowsFor` (T1) consumed T3/T7/T8; `suggestBrands`/`addUserBrand`/`listUserBrands` (T5) consumed T6; schema fields (T2) consumed T3/T7/T8. ✓
- **No placeholders:** wheel ranges, ranking rules, caption formats, and row specs are all concrete; research task defines sources, dedupe rules, and a validation test rather than code (its artifact is data). ✓
