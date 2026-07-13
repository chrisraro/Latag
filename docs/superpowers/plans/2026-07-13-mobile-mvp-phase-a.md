# Latag Mobile MVP (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the offline-first Latag mobile MVP — sessions, 5-second item logging, dual-mode money math, photos, IG export, 20-log free tier — inside a pnpm monorepo ready to receive the Next.js web app in Phase B.

**Architecture:** Expo Router app in `apps/mobile`; all reads via Drizzle `useLiveQuery` over expo-sqlite, all writes through a thin repo layer; pure-function money/caption/entitlement logic tested with jest against better-sqlite3 in-memory databases; media pipeline writes compressed JPEGs to the app document directory and stores only `file://` URIs.

**Tech Stack:** pnpm workspaces · Expo SDK (current, ≥53) + Expo Router · TypeScript strict · drizzle-orm/expo-sqlite + drizzle-kit · NativeWind 4 · Reanimated + gesture-handler · expo-camera / expo-image-manipulator / expo-file-system / expo-image / expo-haptics / expo-clipboard / expo-crypto · @shopify/flash-list · jest (jest-expo preset) + better-sqlite3 (tests only)

## Global Constraints

Copied from the approved specs — every task inherits these:

- **Zero cloud reads/writes for inventory, sessions, photos.** No fetch of app data, ever. (MVP has no network code at all.)
- **Never store image BLOBs in SQLite; never upload images.** Pipeline: `expo-image-manipulator` (resize width 1200, compress 0.7, JPEG) → move into `${FileSystem.documentDirectory}latag_media/` → store the `file://` URI string only.
- **Zero-typing item flow:** wheels/chips only; text inputs exist solely in New Session (name, location) and brand search.
- **State = `useLiveQuery`.** No Redux/Zustand. Ephemeral console state in local React state/context only.
- **Money in whole pesos as SQLite `real`;** display via `formatPeso` → `₱1,250`; tabular treatment in UI.
- **Free tier:** 20 lifetime item creations (`FREE_LOG_LIMIT = 20`); edits free; deletes never refund; counter in local `entitlements` table; at 0 the console shows the Go Pro sheet (link copy only — **no in-app purchase flow**).
- **Schema is the blueprint schema verbatim** + `items.soldPrice`, `items.soldAt`, `items.createdAt` + local `entitlements` table. Category enum (tops only): `Tee, Polo, Longsleeve, Jacket, Hoodie, Sweater, Jersey, Crewneck`. Condition enum: `10/10, 9/10, 8/10, 7/10`.
- **Design tokens from `DESIGN.md`:** bg `#000000`, surface1 `#111111`, surface2 `#1A1A1A`, hairline `#262626`, ink `#F2F2F2`, inkDim `#ADADAD`, inkFaint `#8A8A8A`, acid `#B8F135`, acidInk `#141A05`, danger `#FF5A3C`. Fonts: Archivo (text voice) + Archivo Expanded (display voice). Touch targets ≥44px visual. Dark-only.
- **RN build rules:** FlashList for item lists; `expo-image` for all images; Reanimated animates transform/opacity only; `Pressable` (+`hitSlop`) never Touchable*; sheets as Expo Router modals; safe-area insets everywhere; haptics: light = chip/detent, medium = save/sold, error = failure.
- **TDD for all logic modules** (`lib/`, `db/`, repo). UI tasks gate on `tsc --noEmit` + manual run. Commit at the end of every task (or TDD cycle).
- IDs: `Crypto.randomUUID()` from `expo-crypto`. Timestamps: `new Date()` stored via Drizzle `{ mode: 'timestamp' }` integer columns.

**File structure (end state):**

```
pnpm-workspace.yaml, package.json, .gitignore, .npmrc
apps/web/README.md                      (Phase B placeholder)
apps/mobile/
  app/_layout.tsx                       root: fonts, migrations, sweep, Stack
  app/index.tsx                         Sessions List (+ empty state)
  app/session/new.tsx                   New Session (modal)
  app/session/[id]/index.tsx            Dashboard (mode-adaptive)
  app/session/[id]/add.tsx              Rapid Console
  app/session/[id]/camera.tsx           Camera capture (modal)
  app/session/[id]/export.tsx           IG Export
  app/item/[id]/index.tsx               Item Detail
  app/item/[id]/sold.tsx                Mark Sold (modal)
  components/ui.tsx                     Chip, Badge, PrimaryButton, SecondaryButton, FieldLabel, Toast
  components/Wheel.tsx                  haptic snap wheel
  components/PhotoSlot.tsx              photo slot + thumbnail
  components/GoProSheet.tsx             free-tier wall
  db/schema.ts  db/client.ts            Drizzle schema + expo client
  drizzle/                              generated migrations
  lib/format.ts lib/math.ts lib/caption.ts lib/entitlements.ts lib/repo.ts lib/media.ts lib/photo-staging.ts lib/theme.ts
  tests/                                jest specs for every lib/db module
  assets/fonts/                         Archivo statics (instanced)
docs/qa/mobile-mvp-checklist.md         manual device QA
```

---

### Task 1: Monorepo scaffold + Expo app

**Files:**
- Create: `pnpm-workspace.yaml`, root `package.json`, `.gitignore`, `.npmrc`, `apps/web/README.md`
- Create (generated): `apps/mobile/*` via create-expo-app, then cleaned

**Interfaces:**
- Produces: a bootable Expo Router TS app at `apps/mobile` inside a pnpm workspace; `pnpm -C apps/mobile exec tsc --noEmit` passes.

- [ ] **Step 1: Root workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
```

Root `package.json`:
```json
{
  "name": "latag",
  "private": true,
  "scripts": {
    "mobile": "pnpm -C apps/mobile start",
    "test": "pnpm -C apps/mobile test",
    "typecheck": "pnpm -C apps/mobile exec tsc --noEmit"
  }
}
```

`.npmrc` (Expo + pnpm requirement):
```
node-linker=hoisted
```

`.gitignore`:
```
node_modules/
.expo/
dist/
*.log
.DS_Store
apps/mobile/ios
apps/mobile/android
```

`apps/web/README.md`:
```md
# Latag Web (Phase B placeholder)
Next.js monolith: landing · portal · admin · legal · APIs. See docs/superpowers/specs/2026-07-13-latag-platform-monetization-design.md.
```

- [ ] **Step 2: Create the Expo app**

Run (repo root):
```
npx create-expo-app@latest apps/mobile --template default
```
Then remove the template demo screens:
```
pnpm -C apps/mobile run reset-project
```
(Answer "n" to keeping example files; this leaves a minimal `app/` with `_layout.tsx` and `index.tsx`.) Delete `apps/mobile/app-example` if the script left it.

- [ ] **Step 3: Enforce TypeScript strict**

In `apps/mobile/tsconfig.json` ensure:
```json
{ "extends": "expo/tsconfig.base", "compilerOptions": { "strict": true, "paths": { "@/*": ["./*"] } } }
```

- [ ] **Step 4: Verify**

Run: `pnpm install` then `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with Expo Router app"
```

---

### Task 2: Tooling — NativeWind, tokens, fonts, jest

**Files:**
- Modify: `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/app.json`, `apps/mobile/package.json`
- Create: `apps/mobile/tailwind.config.js`, `apps/mobile/global.css`, `apps/mobile/nativewind-env.d.ts`, `apps/mobile/lib/theme.ts`, `apps/mobile/scripts/fetch-fonts.mjs`, `apps/mobile/assets/fonts/*`

**Interfaces:**
- Produces: NativeWind classes with Latag tokens (`bg-bg`, `text-ink`, `text-acid`, …); font families `Archivo`, `Archivo-Medium`, `Archivo-SemiBold`, `Archivo-Bold`, `ArchivoExpanded-ExtraBold`, `ArchivoExpanded-Black`; `THEME` constants; `pnpm -C apps/mobile test` runs jest.

- [ ] **Step 1: Install deps**

```
pnpm -C apps/mobile exec npx expo install nativewind tailwindcss react-native-reanimated react-native-gesture-handler react-native-safe-area-context expo-font expo-splash-screen
pnpm -C apps/mobile add -D jest jest-expo @types/jest babel-plugin-inline-import
```

- [ ] **Step 2: NativeWind wiring**

`apps/mobile/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    colors: {
      bg: "#000000", surface1: "#111111", surface2: "#1A1A1A", hairline: "#262626",
      ink: "#F2F2F2", inkdim: "#ADADAD", inkfaint: "#8A8A8A",
      acid: "#B8F135", acidink: "#141A05", danger: "#FF5A3C", white: "#FFFFFF", transparent: "transparent",
    },
    extend: { borderRadius: { card: "12px", sheet: "20px" } },
  },
};
```

`apps/mobile/global.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/mobile/babel.config.js` (also preps Task 3's `.sql` imports):
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins: [["inline-import", { extensions: [".sql"] }], "react-native-reanimated/plugin"],
  };
};
```

`apps/mobile/metro.config.js`:
```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../..")];
config.resolver.sourceExts.push("sql");
module.exports = withNativeWind(config, { input: "./global.css" });
```

`apps/mobile/nativewind-env.d.ts`:
```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 3: Theme constants** — `apps/mobile/lib/theme.ts`:
```ts
export const COLORS = {
  bg: "#000000", surface1: "#111111", surface2: "#1A1A1A", hairline: "#262626",
  ink: "#F2F2F2", inkDim: "#ADADAD", inkFaint: "#8A8A8A",
  acid: "#B8F135", acidInk: "#141A05", danger: "#FF5A3C",
} as const;

export const FONT = {
  text: "Archivo", medium: "Archivo-Medium", semibold: "Archivo-SemiBold", bold: "Archivo-Bold",
  display: "ArchivoExpanded-ExtraBold", displayBlack: "ArchivoExpanded-Black",
} as const;

export const CATEGORIES = ["Tee", "Polo", "Longsleeve", "Jacket", "Hoodie", "Sweater", "Jersey", "Crewneck"] as const;
export const CONDITIONS = ["10/10", "9/10", "8/10", "7/10"] as const;
```

- [ ] **Step 4: Fonts** — `apps/mobile/scripts/fetch-fonts.mjs` downloads the Archivo variable font from the google/fonts repo and instances the six statics with fonttools (via `uvx`, already on this machine):
```js
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const SRC = "https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf";
mkdirSync("assets/fonts", { recursive: true });
const buf = await (await fetch(SRC)).arrayBuffer();
writeFileSync("assets/fonts/Archivo-VF.ttf", Buffer.from(buf));
const instances = [
  ["Archivo-Regular", "wdth=100 wght=400"], ["Archivo-Medium", "wdth=100 wght=500"],
  ["Archivo-SemiBold", "wdth=100 wght=600"], ["Archivo-Bold", "wdth=100 wght=700"],
  ["ArchivoExpanded-ExtraBold", "wdth=125 wght=800"], ["ArchivoExpanded-Black", "wdth=125 wght=900"],
];
for (const [name, axes] of instances)
  execSync(`uvx --from fonttools fonttools varLib.instancer assets/fonts/Archivo-VF.ttf ${axes} -o assets/fonts/${name}.ttf`, { stdio: "inherit" });
```
Run: `node scripts/fetch-fonts.mjs` (cwd `apps/mobile`). Expected: six `.ttf` files in `assets/fonts/`. Delete `Archivo-VF.ttf` after. Commit the six statics (OFL license permits bundling).

- [ ] **Step 5: jest config** — append to `apps/mobile/package.json`:
```json
{
  "scripts": { "test": "jest" },
  "jest": {
    "preset": "jest-expo",
    "testMatch": ["**/tests/**/*.test.ts"],
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|drizzle-orm)"
    ]
  }
}
```
Add smoke test `apps/mobile/tests/smoke.test.ts`:
```ts
test("jest runs", () => expect(1 + 1).toBe(2));
```
Run: `pnpm -C apps/mobile test` → PASS. Run `pnpm typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: NativeWind tokens, Archivo fonts, jest harness"
```

---

### Task 3: Drizzle schema, migrations, clients

**Files:**
- Create: `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`, `apps/mobile/drizzle.config.ts`, `apps/mobile/tests/helpers/testDb.ts`, `apps/mobile/tests/schema.test.ts`
- Create (generated): `apps/mobile/drizzle/*`

**Interfaces:**
- Produces: `schema` exports `sessions`, `items`, `photos`, `entitlements` (+ inferred types `Session`, `Item`, `Photo`, `Entitlements`); `db/client.ts` exports `db` (ExpoSQLiteDatabase); `tests/helpers/testDb.ts` exports `makeTestDb(): { db: DB }` where **`type DB = BaseSQLiteDatabase<"sync", any, typeof schema>`** — every later db-consuming function is typed against `DB`.

- [ ] **Step 1: Install**

```
pnpm -C apps/mobile exec npx expo install expo-sqlite expo-crypto
pnpm -C apps/mobile add drizzle-orm
pnpm -C apps/mobile add -D drizzle-kit better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2: Schema (failing tests first)** — `apps/mobile/tests/schema.test.ts`:
```ts
import { makeTestDb } from "./helpers/testDb";
import * as s from "../db/schema";

test("schema round-trips a session, item, photo, entitlements", () => {
  const { db } = makeTestDb();
  db.insert(s.sessions).values({ id: "s1", name: "Naga Run", type: "bulto", totalBaleCost: 10000, location: "Naga", createdAt: new Date() }).run();
  db.insert(s.items).values({ id: "i1", sessionId: "s1", brand: "Nike", category: "Tee", ptpInches: 21.5, lengthInches: 27, condition: "9/10", targetSellPrice: 350, createdAt: new Date() }).run();
  db.insert(s.photos).values({ id: "p1", itemId: "i1", localUri: "file:///x/a.jpg", type: "front" }).run();
  db.insert(s.entitlements).values({ id: 1 }).run();
  const item = db.select().from(s.items).all()[0];
  expect(item.status).toBe("available");
  expect(item.individualCost).toBe(0);
  expect(db.select().from(s.entitlements).all()[0].logsUsed).toBe(0);
});
```

- [ ] **Step 3: Write the schema** — `apps/mobile/db/schema.ts` (blueprint verbatim + approved additions):
```ts
import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["selector", "bulto"] }).notNull(),
  totalBaleCost: real("total_bale_cost").default(0),
  location: text("location"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => sessions.id).notNull(),
  brand: text("brand").notNull(),
  category: text("category").notNull(),
  ptpInches: real("ptp_inches").notNull(),
  lengthInches: real("length_inches").notNull(),
  condition: text("condition").notNull(),
  individualCost: real("individual_cost").default(0).notNull(),
  targetSellPrice: real("target_sell_price").notNull(),
  status: text("status", { enum: ["available", "sold"] }).default("available").notNull(),
  soldPrice: real("sold_price"),
  soldAt: integer("sold_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  itemId: text("item_id").references(() => items.id).notNull(),
  localUri: text("local_uri").notNull(),
  type: text("type", { enum: ["front", "back", "tag", "flaw"] }).notNull(),
});

export const entitlements = sqliteTable("entitlements", {
  id: integer("id").primaryKey(),               // always 1 — single row
  logsUsed: integer("logs_used").default(0).notNull(),
  pro: integer("pro", { mode: "boolean" }).default(false).notNull(),
  licenseReceipt: text("license_receipt"),
});

export type Session = typeof sessions.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Entitlements = typeof entitlements.$inferSelect;
```

`apps/mobile/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({ schema: "./db/schema.ts", out: "./drizzle", dialect: "sqlite", driver: "expo" });
```

Generate migrations: `pnpm -C apps/mobile exec drizzle-kit generate` → creates `drizzle/0000_*.sql` + `drizzle/migrations.js`.

`apps/mobile/tests/helpers/testDb.ts`:
```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "../../db/schema";
import path from "node:path";

export type DB = BaseSQLiteDatabase<"sync", any, typeof schema>;

export function makeTestDb(): { db: DB } {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, "../../drizzle") });
  return { db: db as unknown as DB };
}
```

`apps/mobile/db/client.ts`:
```ts
import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

export const sqlite = openDatabaseSync("latag.db", { enableChangeListener: true });
export const db = drizzle(sqlite, { schema });
```

- [ ] **Step 4: Run tests**

Run: `pnpm -C apps/mobile test tests/schema.test.ts` → PASS. `pnpm typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): drizzle schema, migrations, expo + test clients"
```

---

### Task 4: `lib/format.ts` — peso & inches formatting (TDD)

**Files:** Create `apps/mobile/lib/format.ts`, `apps/mobile/tests/format.test.ts`

**Interfaces:**
- Produces: `formatPeso(n: number): string` (`₱1,250`, `-₱120`, rounds to whole pesos); `formatInches(n: number): string` (`21"`, `21.5"`); `formatPct(n: number): string` (`38%`, rounds).

- [ ] **Step 1: Failing tests** — `apps/mobile/tests/format.test.ts`:
```ts
import { formatPeso, formatInches, formatPct } from "../lib/format";

test.each([[0, "₱0"], [350, "₱350"], [1250, "₱1,250"], [12700, "₱12,700"], [-120, "-₱120"], [749.6, "₱750"]])(
  "formatPeso(%p) → %p", (n, out) => expect(formatPeso(n)).toBe(out));
test.each([[21, '21"'], [21.5, '21.5"'], [27.0, '27"']])("formatInches(%p) → %p", (n, out) => expect(formatInches(n)).toBe(out));
test.each([[38.2, "38%"], [126.7, "127%"], [0, "0%"]])("formatPct(%p) → %p", (n, out) => expect(formatPct(n)).toBe(out));
```
Run: `pnpm -C apps/mobile test tests/format.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement** — `apps/mobile/lib/format.ts`:
```ts
export function formatPeso(n: number): string {
  const r = Math.round(n);
  const sign = r < 0 ? "-" : "";
  return `${sign}₱${Math.abs(r).toLocaleString("en-PH")}`;
}
export function formatInches(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}"`;
}
export function formatPct(n: number): string {
  return `${Math.round(n)}%`;
}
```

- [ ] **Step 3: Run tests** → PASS. **Step 4: Commit** `feat(lib): peso/inches/percent formatters`

---

### Task 5: `lib/math.ts` — dual-mode money math (TDD)

**Files:** Create `apps/mobile/lib/math.ts`, `apps/mobile/tests/math.test.ts`

**Interfaces:**
- Consumes: `Item` type from `db/schema`.
- Produces (all take `Pick<Item, "targetSellPrice" | "individualCost" | "soldPrice" | "status">[]`):
  `selectorProjected(items): number` · `selectorRealized(items): number` · `bultoProjectedPct(items, baleCost): number | null` · `bultoRealizedPct(items, baleCost): number | null` · `soldRevenue(items): number`. Percent fns return `null` when `baleCost <= 0` (UI renders `—`).

- [ ] **Step 1: Failing tests** — `apps/mobile/tests/math.test.ts`:
```ts
import { selectorProjected, selectorRealized, bultoProjectedPct, bultoRealizedPct, soldRevenue } from "../lib/math";

const it = (t: number, c = 0, sold?: number) =>
  ({ targetSellPrice: t, individualCost: c, soldPrice: sold ?? null, status: (sold != null ? "sold" : "available") as "sold" | "available" });

test("empty session → zeros", () => {
  expect(selectorProjected([])).toBe(0);
  expect(selectorRealized([])).toBe(0);
});
test("selector projected = Σtarget − Σcost over ALL items", () =>
  expect(selectorProjected([it(550, 100), it(400, 80, 380)])).toBe(550 + 400 - 100 - 80));
test("selector realized = Σsold − Σcost over SOLD only; below-cost goes negative", () => {
  expect(selectorRealized([it(550, 100), it(400, 80, 380)])).toBe(380 - 80);
  expect(selectorRealized([it(400, 500, 450)])).toBe(-50);
});
test("bulto recovery pcts; zero bale → null", () => {
  const items = [it(350), it(480, 0, 500), it(150)];
  expect(bultoProjectedPct(items, 10000)).toBeCloseTo(((350 + 480 + 150) / 10000) * 100);
  expect(bultoRealizedPct(items, 10000)).toBeCloseTo((500 / 10000) * 100);
  expect(bultoProjectedPct(items, 0)).toBeNull();
  expect(bultoRealizedPct(items, 0)).toBeNull();
});
test("soldRevenue sums soldPrice of sold items", () =>
  expect(soldRevenue([it(550, 0, 500), it(300)])).toBe(500));
```
Run → FAIL.

- [ ] **Step 2: Implement** — `apps/mobile/lib/math.ts`:
```ts
type MoneyItem = { targetSellPrice: number; individualCost: number; soldPrice: number | null; status: "available" | "sold" };

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const sold = (items: MoneyItem[]) => items.filter((i) => i.status === "sold");

export function selectorProjected(items: MoneyItem[]): number {
  return sum(items.map((i) => i.targetSellPrice)) - sum(items.map((i) => i.individualCost));
}
export function selectorRealized(items: MoneyItem[]): number {
  const s = sold(items);
  return sum(s.map((i) => i.soldPrice ?? 0)) - sum(s.map((i) => i.individualCost));
}
export function soldRevenue(items: MoneyItem[]): number {
  return sum(sold(items).map((i) => i.soldPrice ?? 0));
}
export function bultoProjectedPct(items: MoneyItem[], baleCost: number): number | null {
  if (baleCost <= 0) return null;
  return (sum(items.map((i) => i.targetSellPrice)) / baleCost) * 100;
}
export function bultoRealizedPct(items: MoneyItem[], baleCost: number): number | null {
  if (baleCost <= 0) return null;
  return (soldRevenue(items) / baleCost) * 100;
}
```

- [ ] **Step 3: Run tests** → PASS. **Step 4: Commit** `feat(lib): dual-mode money math`

---

### Task 6: `lib/caption.ts` — IG drop formatter (TDD)

**Files:** Create `apps/mobile/lib/caption.ts`, `apps/mobile/tests/caption.test.ts`

**Interfaces:**
- Consumes: `formatInches`, `formatPeso` semantics (peso without decimals — caption uses raw number with comma grouping but **no ₱ symbol duplication**: template shows `₱[target]`).
- Produces: `formatCaption(items: CaptionItem[]): string` where `CaptionItem = Pick<Item, "brand" | "category" | "ptpInches" | "lengthInches" | "condition" | "targetSellPrice">`. Exact blueprint template per item, items joined by newline after each `---` block.

- [ ] **Step 1: Failing test** — `apps/mobile/tests/caption.test.ts`:
```ts
import { formatCaption } from "../lib/caption";

test("caption matches blueprint template exactly", () => {
  const out = formatCaption([
    { brand: "Stüssy", category: "Tee", ptpInches: 21, lengthInches: 27, condition: "9/10", targetSellPrice: 550 },
    { brand: "Carhartt", category: "Hoodie", ptpInches: 24, lengthInches: 28.5, condition: "10/10", targetSellPrice: 1250 },
  ]);
  expect(out).toBe(
    `👕 Stüssy Tee\n📏 Size: (PTP: 21" | L: 27")\n✨ Condition: 9/10\n💸 ₱550\n📍 Comment "Mine" to claim\n---\n` +
    `👕 Carhartt Hoodie\n📏 Size: (PTP: 24" | L: 28.5")\n✨ Condition: 10/10\n💸 ₱1,250\n📍 Comment "Mine" to claim\n---`
  );
});
test("empty selection → empty string", () => expect(formatCaption([])).toBe(""));
```
Run → FAIL.

- [ ] **Step 2: Implement** — `apps/mobile/lib/caption.ts`:
```ts
import { formatInches } from "./format";

export type CaptionItem = {
  brand: string; category: string; ptpInches: number; lengthInches: number;
  condition: string; targetSellPrice: number;
};

export function formatCaption(items: CaptionItem[]): string {
  return items
    .map((i) =>
      [
        `👕 ${i.brand} ${i.category}`,
        `📏 Size: (PTP: ${formatInches(i.ptpInches)} | L: ${formatInches(i.lengthInches)})`,
        `✨ Condition: ${i.condition}`,
        `💸 ₱${Math.round(i.targetSellPrice).toLocaleString("en-PH")}`,
        `📍 Comment "Mine" to claim`,
        `---`,
      ].join("\n"),
    )
    .join("\n");
}
```

- [ ] **Step 3: Run tests** → PASS. **Step 4: Commit** `feat(lib): IG drop caption formatter`

---

### Task 7: `lib/entitlements.ts` — 20-log free tier (TDD)

**Files:** Create `apps/mobile/lib/entitlements.ts`, `apps/mobile/tests/entitlements.test.ts`

**Interfaces:**
- Consumes: `DB` from `tests/helpers/testDb` typing (runtime: any drizzle sqlite db with `schema.entitlements`).
- Produces: `FREE_LOG_LIMIT = 20` · `ensureEntitlements(db): Entitlements` (idempotent insert of row id=1) · `logsRemaining(e: Entitlements): number` (Infinity when pro) · `consumeLog(db): number` (increments `logsUsed`, returns remaining AFTER; throws `FreeTierExhaustedError` if none left and not pro) · `class FreeTierExhaustedError extends Error`.

- [ ] **Step 1: Failing tests** — `apps/mobile/tests/entitlements.test.ts`:
```ts
import { makeTestDb } from "./helpers/testDb";
import { FREE_LOG_LIMIT, ensureEntitlements, logsRemaining, consumeLog, FreeTierExhaustedError } from "../lib/entitlements";
import { entitlements } from "../db/schema";
import { eq } from "drizzle-orm";

test("ensureEntitlements is idempotent and starts at 0 used", () => {
  const { db } = makeTestDb();
  const e1 = ensureEntitlements(db);
  const e2 = ensureEntitlements(db);
  expect(e1.logsUsed).toBe(0);
  expect(e2.id).toBe(1);
});
test("consumeLog counts down to the wall and throws at 0", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  for (let i = 1; i <= FREE_LOG_LIMIT; i++) expect(consumeLog(db)).toBe(FREE_LOG_LIMIT - i);
  expect(() => consumeLog(db)).toThrow(FreeTierExhaustedError);
});
test("pro accounts never exhaust", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  db.update(entitlements).set({ pro: true, logsUsed: 999 }).where(eq(entitlements.id, 1)).run();
  expect(consumeLog(db)).toBe(Infinity);
  expect(logsRemaining(db.select().from(entitlements).all()[0])).toBe(Infinity);
});
```
Run → FAIL.

- [ ] **Step 2: Implement** — `apps/mobile/lib/entitlements.ts`:
```ts
import { eq, sql } from "drizzle-orm";
import { entitlements, type Entitlements } from "../db/schema";

export const FREE_LOG_LIMIT = 20;

export class FreeTierExhaustedError extends Error {
  constructor() { super("Free tier exhausted: 20 lifetime logs used"); this.name = "FreeTierExhaustedError"; }
}

// db is any sync drizzle sqlite database that includes the entitlements table.
type AnyDb = any;

export function ensureEntitlements(db: AnyDb): Entitlements {
  db.insert(entitlements).values({ id: 1 }).onConflictDoNothing().run();
  return db.select().from(entitlements).where(eq(entitlements.id, 1)).all()[0];
}

export function logsRemaining(e: Entitlements): number {
  return e.pro ? Infinity : Math.max(0, FREE_LOG_LIMIT - e.logsUsed);
}

export function consumeLog(db: AnyDb): number {
  const e = ensureEntitlements(db);
  if (e.pro) return Infinity;
  if (e.logsUsed >= FREE_LOG_LIMIT) throw new FreeTierExhaustedError();
  db.update(entitlements).set({ logsUsed: sql`${entitlements.logsUsed} + 1` }).where(eq(entitlements.id, 1)).run();
  return FREE_LOG_LIMIT - (e.logsUsed + 1);
}
```

- [ ] **Step 3: Run tests** → PASS. **Step 4: Commit** `feat(lib): free-tier entitlements (20 lifetime logs)`

---

### Task 8: `lib/repo.ts` — write layer (TDD)

**Files:** Create `apps/mobile/lib/repo.ts`, `apps/mobile/tests/repo.test.ts`

**Interfaces:**
- Consumes: schema tables; `consumeLog`/`FreeTierExhaustedError`; `Crypto.randomUUID` (injected as `newId` for testability).
- Produces:
  - `createSession(db, input: { name: string; type: "selector" | "bulto"; totalBaleCost?: number; location?: string }): Session`
  - `addItem(db, input: { sessionId: string; brand: string; category: string; ptpInches: number; lengthInches: number; condition: string; individualCost?: number; targetSellPrice: number }): { item: Item; logsRemaining: number }` — consumes a free-tier log inside the same transaction; throws `FreeTierExhaustedError` without inserting.
  - `updateItem(db, id, patch: Partial<addItem input>): Item` (no log consumed)
  - `addPhoto(db, input: { itemId: string; localUri: string; type: "front" | "back" | "tag" | "flaw" }): Photo`
  - `markSold(db, id, soldPrice: number): Item` · `unmarkSold(db, id): Item`
  - `deleteItem(db, id): { photoUris: string[] }` — removes photo rows + item row transactionally, returns URIs so the media layer can delete files (repo never touches the filesystem).

- [ ] **Step 1: Failing tests** — `apps/mobile/tests/repo.test.ts`:
```ts
import { makeTestDb } from "./helpers/testDb";
import { createSession, addItem, updateItem, addPhoto, markSold, unmarkSold, deleteItem } from "../lib/repo";
import { ensureEntitlements, FREE_LOG_LIMIT, FreeTierExhaustedError } from "../lib/entitlements";
import { items, photos } from "../db/schema";

const base = { brand: "Nike", category: "Tee", ptpInches: 21.5, lengthInches: 27, condition: "9/10", targetSellPrice: 350 };

test("create session → add item consumes a log", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item, logsRemaining } = addItem(db, { sessionId: s.id, ...base, individualCost: 60 });
  expect(item.status).toBe("available");
  expect(logsRemaining).toBe(FREE_LOG_LIMIT - 1);
});
test("exhausted tier blocks insert atomically", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "bulto", totalBaleCost: 10000 });
  for (let i = 0; i < FREE_LOG_LIMIT; i++) addItem(db, { sessionId: s.id, ...base });
  expect(() => addItem(db, { sessionId: s.id, ...base })).toThrow(FreeTierExhaustedError);
  expect(db.select().from(items).all()).toHaveLength(FREE_LOG_LIMIT);
});
test("edits are free; sold flow records and clears price+date", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...base });
  updateItem(db, item.id, { targetSellPrice: 400 });
  const soldItem = markSold(db, item.id, 380);
  expect(soldItem.status).toBe("sold");
  expect(soldItem.soldPrice).toBe(380);
  expect(soldItem.soldAt).toBeInstanceOf(Date);
  const undone = unmarkSold(db, item.id);
  expect(undone.status).toBe("available");
  expect(undone.soldPrice).toBeNull();
});
test("deleteItem removes rows, returns photo uris, never refunds logs", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item, logsRemaining: before } = addItem(db, { sessionId: s.id, ...base });
  addPhoto(db, { itemId: item.id, localUri: "file:///m/a.jpg", type: "front" });
  const { photoUris } = deleteItem(db, item.id);
  expect(photoUris).toEqual(["file:///m/a.jpg"]);
  expect(db.select().from(items).all()).toHaveLength(0);
  expect(db.select().from(photos).all()).toHaveLength(0);
  const after = addItem(db, { sessionId: s.id, ...base }).logsRemaining;
  expect(after).toBe(before - 1); // no refund happened
});
```
Run → FAIL.

- [ ] **Step 2: Implement** — `apps/mobile/lib/repo.ts`:
```ts
import { eq } from "drizzle-orm";
import * as Crypto from "expo-crypto";
import { sessions, items, photos, type Session, type Item, type Photo } from "../db/schema";
import { consumeLog } from "./entitlements";

type AnyDb = any;
const newId = () => Crypto.randomUUID();

export function createSession(db: AnyDb, input: { name: string; type: "selector" | "bulto"; totalBaleCost?: number; location?: string }): Session {
  const row = { id: newId(), name: input.name, type: input.type, totalBaleCost: input.totalBaleCost ?? 0, location: input.location ?? null, createdAt: new Date() };
  db.insert(sessions).values(row).run();
  return db.select().from(sessions).where(eq(sessions.id, row.id)).all()[0];
}

export type AddItemInput = {
  sessionId: string; brand: string; category: string; ptpInches: number; lengthInches: number;
  condition: string; individualCost?: number; targetSellPrice: number;
};

export function addItem(db: AnyDb, input: AddItemInput): { item: Item; logsRemaining: number } {
  return db.transaction((tx: AnyDb) => {
    const logsRemaining = consumeLog(tx); // throws before insert when exhausted
    const row = {
      id: newId(), sessionId: input.sessionId, brand: input.brand, category: input.category,
      ptpInches: input.ptpInches, lengthInches: input.lengthInches, condition: input.condition,
      individualCost: input.individualCost ?? 0, targetSellPrice: input.targetSellPrice, createdAt: new Date(),
    };
    tx.insert(items).values(row).run();
    return { item: tx.select().from(items).where(eq(items.id, row.id)).all()[0], logsRemaining };
  });
}

export function updateItem(db: AnyDb, id: string, patch: Partial<Omit<AddItemInput, "sessionId">>): Item {
  db.update(items).set(patch).where(eq(items.id, id)).run();
  return db.select().from(items).where(eq(items.id, id)).all()[0];
}

export function addPhoto(db: AnyDb, input: { itemId: string; localUri: string; type: "front" | "back" | "tag" | "flaw" }): Photo {
  const row = { id: newId(), ...input };
  db.insert(photos).values(row).run();
  return db.select().from(photos).where(eq(photos.id, row.id)).all()[0];
}

export function markSold(db: AnyDb, id: string, soldPrice: number): Item {
  db.update(items).set({ status: "sold", soldPrice, soldAt: new Date() }).where(eq(items.id, id)).run();
  return db.select().from(items).where(eq(items.id, id)).all()[0];
}

export function unmarkSold(db: AnyDb, id: string): Item {
  db.update(items).set({ status: "available", soldPrice: null, soldAt: null }).where(eq(items.id, id)).run();
  return db.select().from(items).where(eq(items.id, id)).all()[0];
}

export function deleteItem(db: AnyDb, id: string): { photoUris: string[] } {
  return db.transaction((tx: AnyDb) => {
    const uris = tx.select().from(photos).where(eq(photos.itemId, id)).all().map((p: Photo) => p.localUri);
    tx.delete(photos).where(eq(photos.itemId, id)).run();
    tx.delete(items).where(eq(items.id, id)).run();
    return { photoUris: uris };
  });
}
```
Note: `expo-crypto` in jest — jest-expo mocks it; if `randomUUID` is undefined in tests, add to `tests/helpers/setup.ts`: `jest.mock("expo-crypto", () => ({ randomUUID: () => require("node:crypto").randomUUID() }));` and register via `setupFiles` in the jest config.

- [ ] **Step 3: Run tests** → `pnpm -C apps/mobile test tests/repo.test.ts` → PASS (all 4). **Step 4: Commit** `feat(lib): repo write layer with free-tier enforcement`

---

### Task 9: `lib/media.ts` — photo pipeline + orphan sweep

**Files:** Create `apps/mobile/lib/media.ts`, `apps/mobile/tests/media.test.ts`

**Interfaces:**
- Produces: `MEDIA_DIR: string` · `persistPhoto(tempUri: string): Promise<string>` (compress → move → return `file://` URI; file is written **before** any DB row — caller inserts the row) · `deleteFiles(uris: string[]): Promise<void>` (ignores missing) · `orphanUris(filesInDir: string[], dbUris: string[]): string[]` (**pure — TDD**) · `sweepOrphans(db): Promise<number>` (lists dir, diffs against `photos.localUri`, deletes orphans, returns count).

- [ ] **Step 1: Failing test for the pure part** — `apps/mobile/tests/media.test.ts`:
```ts
import { orphanUris } from "../lib/media";

test("orphanUris returns files present on disk but absent from db", () => {
  const disk = ["file:///d/latag_media/a.jpg", "file:///d/latag_media/b.jpg", "file:///d/latag_media/c.jpg"];
  const dbRows = ["file:///d/latag_media/b.jpg"];
  expect(orphanUris(disk, dbRows)).toEqual(["file:///d/latag_media/a.jpg", "file:///d/latag_media/c.jpg"]);
});
test("no orphans → empty", () => expect(orphanUris(["file:///x/a.jpg"], ["file:///x/a.jpg"])).toEqual([]));
```
Run → FAIL.

- [ ] **Step 2: Implement** — install `pnpm -C apps/mobile exec npx expo install expo-image-manipulator expo-file-system`, then `apps/mobile/lib/media.ts`:
```ts
import * as FileSystem from "expo-file-system/legacy"; // SDK ≥54; on SDK 53 import "expo-file-system"
import * as ImageManipulator from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import { photos } from "../db/schema";

export const MEDIA_DIR = `${FileSystem.documentDirectory}latag_media/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MEDIA_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
}

/** Blueprint protocol: resize w1200 → JPEG 0.7 → move to latag_media/ → return file:// URI. */
export async function persistPhoto(tempUri: string): Promise<string> {
  await ensureDir();
  const compressed = await ImageManipulator.manipulateAsync(tempUri, [{ resize: { width: 1200 } }], {
    compress: 0.7, format: ImageManipulator.SaveFormat.JPEG,
  });
  const dest = `${MEDIA_DIR}${Crypto.randomUUID()}.jpg`;
  await FileSystem.moveAsync({ from: compressed.uri, to: dest });
  return dest;
}

export async function deleteFiles(uris: string[]): Promise<void> {
  await Promise.all(uris.map((u) => FileSystem.deleteAsync(u, { idempotent: true })));
}

/** Pure: files on disk that no DB row references. */
export function orphanUris(filesInDir: string[], dbUris: string[]): string[] {
  const known = new Set(dbUris);
  return filesInDir.filter((f) => !known.has(f));
}

/** Crash between file-write and row-insert leaves an orphan FILE, never a broken row. Sweep on boot. */
export async function sweepOrphans(db: any): Promise<number> {
  await ensureDir();
  const names: string[] = await FileSystem.readDirectoryAsync(MEDIA_DIR);
  const onDisk = names.map((n) => `${MEDIA_DIR}${n}`);
  const inDb = db.select({ uri: photos.localUri }).from(photos).all().map((r: { uri: string }) => r.uri);
  const orphans = orphanUris(onDisk, inDb);
  await deleteFiles(orphans);
  return orphans.length;
}
```

- [ ] **Step 3: Run tests** → PASS (`orphanUris` cases; FS paths are covered by the device QA checklist in Task 16). `pnpm typecheck` → exit 0. **Step 4: Commit** `feat(lib): media pipeline + orphan sweep`

---

### Task 10: UI kit — theme components + Wheel

**Files:** Create `apps/mobile/components/ui.tsx`, `apps/mobile/components/Wheel.tsx`, `apps/mobile/components/PhotoSlot.tsx`, `apps/mobile/components/GoProSheet.tsx`, `apps/mobile/lib/photo-staging.ts`

**Interfaces (consumed by every screen task):**
- `ui.tsx`: `Chip({ label, selected, onPress })` · `Badge({ label, tone?: "default" | "sold" })` · `PrimaryButton({ label, onPress, icon?, disabled? })` · `SecondaryButton({ label, onPress, danger? })` · `FieldLabel({ children })` · `Money({ value, size?: "hero" | "row" })` (Archivo Expanded, acid, tabular).
- `Wheel.tsx`: `Wheel({ values: number[], value: number, onChange: (v: number) => void, unit?: string, format?: (v: number) => string })` — horizontal snap, `Haptics.selectionAsync()` per detent.
- `PhotoSlot.tsx`: `PhotoSlot({ label: "FRONT" | "BACK" | "TAG" | "FLAW", uri: string | null, onPress })` (expo-image thumbnail when filled).
- `GoProSheet.tsx`: `GoProSheet({ visible, onClose })` — free-tier wall copy + `latag.ph/pro` line (copy string only; no purchase flow).
- `photo-staging.ts`: module singleton for camera→console handoff: `stagePhoto(slot, uri)` · `takeStagedPhotos(): Partial<Record<SlotType, string>>` (returns and clears) · `SlotType = "front" | "back" | "tag" | "flaw"`.

- [ ] **Step 1: Install** `pnpm -C apps/mobile exec npx expo install expo-haptics expo-image @shopify/flash-list`

- [ ] **Step 2: `components/ui.tsx`**
```tsx
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FONT } from "../lib/theme";
import { formatPeso } from "../lib/format";

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      hitSlop={4}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      className={`h-11 flex-none flex-row items-center rounded-full border px-4 ${selected ? "border-acid bg-acid" : "border-hairline bg-surface2"}`}
    >
      <Text style={{ fontFamily: selected ? FONT.bold : FONT.medium }} className={`text-[13px] ${selected ? "text-acidink" : "text-inkdim"}`}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = "default" }: { label: string; tone?: "default" | "sold" }) {
  return (
    <View className="flex-none rounded-full border border-hairline px-2.5 py-1">
      <Text style={{ fontFamily: FONT.display }} className={`text-[10px] tracking-wider ${tone === "sold" ? "text-inkfaint" : "text-inkdim"}`}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      className={`my-3 h-14 items-center justify-center rounded-full ${disabled ? "bg-surface2" : "bg-acid"} active:scale-[0.97]`}
    >
      <Text style={{ fontFamily: FONT.display, letterSpacing: 0.5 }} className={`text-[16px] uppercase ${disabled ? "text-inkfaint" : "text-acidink"}`}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} className={`h-12 flex-1 items-center justify-center rounded-full border ${danger ? "border-danger" : "border-hairline bg-surface2"}`}>
      <Text style={{ fontFamily: FONT.display, letterSpacing: 0.5 }} className={`text-[14px] uppercase ${danger ? "text-danger" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: string }) {
  return <Text style={{ fontFamily: FONT.semibold, letterSpacing: 1 }} className="mb-2 mt-4 text-[11.5px] uppercase text-inkfaint">{children}</Text>;
}

export function Money({ value, size = "row" }: { value: number; size?: "hero" | "row" }) {
  return (
    <Text
      style={{ fontFamily: size === "hero" ? FONT.displayBlack : FONT.bold, fontVariant: ["tabular-nums"] }}
      className={size === "hero" ? "text-[34px] text-acid" : "text-[17px] text-ink"}
    >
      {formatPeso(value)}
    </Text>
  );
}
```

- [ ] **Step 3: `components/Wheel.tsx`** (snap ScrollView + haptic detents; 56px track, 64px item width):
```tsx
import { useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FONT } from "../lib/theme";

const ITEM_W = 64;

export function Wheel({ values, value, onChange, unit, format }: {
  values: number[]; value: number; onChange: (v: number) => void; unit?: string; format?: (v: number) => string;
}) {
  const lastIndex = useRef(Math.max(0, values.indexOf(value)));
  const fmt = format ?? ((v: number) => String(v));
  return (
    <View className="h-14 justify-center overflow-hidden rounded-[14px] border border-hairline bg-surface2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM_W}
        decelerationRate="fast"
        contentOffset={{ x: lastIndex.current * ITEM_W, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: (390 - 32 - ITEM_W) / 2 }}
        onScroll={(e) => {
          const i = Math.min(values.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / ITEM_W)));
          if (i !== lastIndex.current) { lastIndex.current = i; Haptics.selectionAsync(); onChange(values[i]); }
        }}
        scrollEventThrottle={16}
      >
        {values.map((v) => (
          <View key={v} style={{ width: ITEM_W }} className="items-center justify-center">
            <Text
              style={{ fontFamily: v === value ? FONT.bold : FONT.semibold, fontVariant: ["tabular-nums"] }}
              className={v === value ? "text-[26px] text-ink" : "text-[15px] text-inkfaint"}
            >{fmt(v)}</Text>
            {v === value && <View className="mt-0.5 h-[3px] w-8 rounded-full bg-acid" />}
          </View>
        ))}
      </ScrollView>
      {unit ? <Text style={{ fontFamily: FONT.semibold }} className="absolute right-3.5 text-[12px] text-inkfaint">{unit}</Text> : null}
    </View>
  );
}

/** Helper to build wheel ranges. rangeValues(14, 36, 0.5) → [14, 14.5, …, 36] */
export function rangeValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 2) / 2);
  return out;
}
```

- [ ] **Step 4: `components/PhotoSlot.tsx`, `lib/photo-staging.ts`, `components/GoProSheet.tsx`**
```tsx
// components/PhotoSlot.tsx
import { Pressable, Text } from "react-native";
import { Image } from "expo-image";
import { FONT } from "../lib/theme";

export function PhotoSlot({ label, uri, onPress }: { label: string; uri: string | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`aspect-square flex-1 items-center justify-center gap-1.5 rounded-[10px] border ${uri ? "border-hairline" : "border-dashed border-hairline"}`}>
      {uri ? <Image source={{ uri }} recyclingKey={uri} style={{ position: "absolute", inset: 0, borderRadius: 10 }} contentFit="cover" /> : null}
      <Text style={{ fontFamily: FONT.display }} className={`text-[10px] ${uri ? "text-inkdim" : "text-inkfaint"}`}>{label}</Text>
    </Pressable>
  );
}
```
```ts
// lib/photo-staging.ts — camera modal → console handoff (no params-passing of files)
export type SlotType = "front" | "back" | "tag" | "flaw";
let staged: Partial<Record<SlotType, string>> = {};
export function stagePhoto(slot: SlotType, uri: string) { staged[slot] = uri; }
export function peekStagedPhotos() { return { ...staged }; }
export function takeStagedPhotos() { const s = { ...staged }; staged = {}; return s; }
```
```tsx
// components/GoProSheet.tsx
import { Modal, Pressable, Text, View } from "react-native";
import { FONT } from "../lib/theme";
import { FREE_LOG_LIMIT } from "../lib/entitlements";
import { PrimaryButton } from "./ui";

export function GoProSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />
      <View className="rounded-t-sheet border-t border-hairline bg-surface1 px-4 pb-7 pt-3">
        <View className="mb-3 h-1 w-11 self-center rounded-full bg-hairline" />
        <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">You logged all {FREE_LOG_LIMIT} free items</Text>
        <Text style={{ fontFamily: FONT.text }} className="mt-1 text-[13px] leading-5 text-inkdim">
          Latag Pro unlocks unlimited logs — one-time payment, yours forever. Everything stays offline and on your phone.
        </Text>
        <Text style={{ fontFamily: FONT.semibold }} className="mt-3 text-[15px] text-acid">Unlock Pro on the website → latag.ph/pro</Text>
        <PrimaryButton label="Got it" onPress={onClose} />
      </View>
    </Modal>
  );
}
```

- [ ] **Step 5: Verify** `pnpm typecheck` → exit 0. **Step 6: Commit** `feat(ui): component kit — chips, buttons, wheel, photo slot, Go Pro sheet`

---

### Task 11: Root layout + Sessions List + New Session

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`
- Create: `apps/mobile/app/session/new.tsx`

**Interfaces:**
- Consumes: `db` (client), `useMigrations`, `ensureEntitlements`, `sweepOrphans`, `createSession`, `useLiveQuery`, math + format libs, ui kit.
- Produces: navigable app shell; routes `/`, `/session/new` (modal), pushes to `/session/[id]`.

- [ ] **Step 1: Root layout** — `apps/mobile/app/_layout.tsx`:
```tsx
import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { db } from "../db/client";
import migrations from "../drizzle/migrations";
import { ensureEntitlements } from "../lib/entitlements";
import { sweepOrphans } from "../lib/media";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { success: migrated } = useMigrations(db, migrations);
  const [fontsLoaded] = useFonts({
    Archivo: require("../assets/fonts/Archivo-Regular.ttf"),
    "Archivo-Medium": require("../assets/fonts/Archivo-Medium.ttf"),
    "Archivo-SemiBold": require("../assets/fonts/Archivo-SemiBold.ttf"),
    "Archivo-Bold": require("../assets/fonts/Archivo-Bold.ttf"),
    "ArchivoExpanded-ExtraBold": require("../assets/fonts/ArchivoExpanded-ExtraBold.ttf"),
    "ArchivoExpanded-Black": require("../assets/fonts/ArchivoExpanded-Black.ttf"),
  });

  useEffect(() => {
    if (migrated) { ensureEntitlements(db); sweepOrphans(db).catch(() => {}); }
  }, [migrated]);
  useEffect(() => { if (migrated && fontsLoaded) SplashScreen.hideAsync(); }, [migrated, fontsLoaded]);
  if (!migrated || !fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }}>
        <Stack.Screen name="session/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="item/[id]/sold" options={{ presentation: "modal" }} />
        <Stack.Screen name="session/[id]/camera" options={{ presentation: "fullScreenModal" }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 2: Sessions List (+ empty state)** — `apps/mobile/app/index.tsx`:
```tsx
import { View, Text, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, items } from "../db/schema";
import { FONT } from "../lib/theme";
import { formatPeso, formatPct } from "../lib/format";
import { selectorProjected, selectorRealized, bultoRealizedPct } from "../lib/math";
import { Badge, PrimaryButton } from "../components/ui";

export default function SessionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).orderBy(desc(sessions.createdAt)));
  const { data: itemRows } = useLiveQuery(db.select().from(items));

  const list = (sessionRows ?? []).map((s) => {
    const its = (itemRows ?? []).filter((i) => i.sessionId === s.id);
    const soldCount = its.filter((i) => i.status === "sold").length;
    const allSold = its.length > 0 && soldCount === its.length;
    let headline: string, note: string;
    if (s.type === "bulto") {
      const pct = bultoRealizedPct(its, s.totalBaleCost ?? 0);
      headline = pct == null ? "—" : formatPct(pct); note = "recovered";
    } else if (allSold) {
      headline = formatPeso(selectorRealized(its)); note = "realized";
    } else {
      headline = formatPeso(selectorProjected(its)); note = "projected";
    }
    return { s, count: its.length, soldCount, headline, note };
  });

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Text style={{ fontFamily: FONT.displayBlack }} className="flex-1 text-[26px] text-ink">LATAG</Text>
        <Badge label={`${list.length} SESSIONS`} />
      </View>
      {list.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-4 px-4">
          <View className="h-24 w-full items-center justify-center rounded-card border border-dashed border-hairline">
            <Text style={{ fontFamily: FONT.text }} className="text-[13px] text-inkfaint">Your first run will show up here</Text>
          </View>
          <Text style={{ fontFamily: FONT.display }} className="text-[18px] text-ink">No sessions yet</Text>
          <Text style={{ fontFamily: FONT.text }} className="text-center text-[13.5px] leading-5 text-inkdim">
            Start one when you hit the racks.{"\n"}Everything works in airplane mode.
          </Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={({ s }) => s.id}
          renderItem={({ item: { s, count, soldCount, headline, note } }) => (
            <Pressable onPress={() => router.push(`/session/${s.id}`)} className="mb-3 rounded-card border border-hairline bg-surface1 p-4">
              <View className="flex-row items-center gap-2">
                <Text style={{ fontFamily: FONT.semibold }} className="flex-1 text-[17px] text-ink" numberOfLines={1}>{s.name}</Text>
                <Badge label={s.type.toUpperCase()} />
              </View>
              {s.location ? <Text style={{ fontFamily: FONT.text }} className="mt-0.5 text-[12px] text-inkfaint">{s.location}</Text> : null}
              <View className="mt-4 flex-row items-baseline justify-between">
                <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="text-[12px] text-inkfaint">{count} items · {soldCount} sold</Text>
                <Text style={{ fontFamily: FONT.display, fontVariant: ["tabular-nums"] }} className="text-[22px] text-acid">
                  {headline} <Text className="text-[12px] text-inkfaint">{note}</Text>
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label="＋  New Session" onPress={() => router.push("/session/new")} />
      </View>
    </View>
  );
}
```

- [ ] **Step 3: New Session modal** — `apps/mobile/app/session/new.tsx`:
```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { db } from "../../db/client";
import { createSession } from "../../lib/repo";
import { FONT } from "../../lib/theme";
import { FieldLabel, PrimaryButton } from "../../components/ui";
import { Wheel, rangeValues } from "../../components/Wheel";

const BALE_VALUES = rangeValues(1000, 50000, 500);

export default function NewSessionScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState<"selector" | "bulto">("selector");
  const [baleCost, setBaleCost] = useState(10000);

  const create = () => {
    if (!name.trim()) return;
    const s = createSession(db, { name: name.trim(), type, location: location.trim() || undefined, totalBaleCost: type === "bulto" ? baleCost : 0 });
    router.replace(`/session/${s.id}`);
  };

  const inputCls = "mb-2.5 h-13 rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink";
  return (
    <View className="flex-1 bg-surface1 px-4 pt-3">
      <View className="mb-3 h-1 w-11 self-center rounded-full bg-hairline" />
      <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">New Session</Text>
      <Text style={{ fontFamily: FONT.text }} className="mb-3 mt-0.5 text-[12.5px] text-inkfaint">Name it after the spot — you'll thank yourself later.</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Session name" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }} className={inputCls} />
      <TextInput value={location} onChangeText={setLocation} placeholder="Location (optional)" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }} className={inputCls} />
      <FieldLabel>Mode</FieldLabel>
      <View className="flex-row gap-1 rounded-full border border-hairline bg-surface2 p-1">
        {(["selector", "bulto"] as const).map((t) => (
          <Pressable key={t} onPress={() => { Haptics.selectionAsync(); setType(t); }} className={`h-11 flex-1 items-center justify-center rounded-full ${type === t ? "bg-acid" : ""}`}>
            <Text style={{ fontFamily: FONT.display }} className={`text-[13px] uppercase ${type === t ? "text-acidink" : "text-inkdim"}`}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {type === "bulto" ? (<>
        <FieldLabel>Bale cost</FieldLabel>
        <Wheel values={BALE_VALUES} value={baleCost} onChange={setBaleCost} unit="₱" format={(v) => v.toLocaleString("en-PH")} />
      </>) : null}
      <PrimaryButton label="Create Session" onPress={create} disabled={!name.trim()} />
    </View>
  );
}
```

- [ ] **Step 4: Verify** `pnpm typecheck` → exit 0; `pnpm mobile` → create a selector and a bulto session on device/simulator; empty state shows on fresh install; cards render headline numbers. **Step 5: Commit** `feat(app): shell, sessions list, new-session modal`

---

### Task 12: Session Dashboard (mode-adaptive)

**Files:** Create `apps/mobile/app/session/[id]/index.tsx`

**Interfaces:**
- Consumes: live queries on `sessions`/`items`/`photos`; math + format; ui kit; FlashList.
- Produces: route `/session/[id]` with filter chips (`All | Available | Sold`), Selector hero (projected + realized) or Bulto hero (recovery bar + projected line), item rows → `/item/[id]`, buttons → `/session/[id]/add` and `/session/[id]/export`.

- [ ] **Step 1: Implement the screen**
```tsx
import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import { sessions, items, photos, type Item } from "../../../db/schema";
import { FONT } from "../../../lib/theme";
import { formatPeso, formatPct, formatInches } from "../../../lib/format";
import { selectorProjected, selectorRealized, bultoProjectedPct, bultoRealizedPct, soldRevenue } from "../../../lib/math";
import { Badge, Chip, PrimaryButton } from "../../../components/ui";

type Filter = "all" | "available" | "sold";

export default function DashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).where(eq(sessions.id, id)), [id]);
  const { data: itemRows } = useLiveQuery(db.select().from(items).where(eq(items.sessionId, id)).orderBy(desc(items.createdAt)), [id]);
  const { data: photoRows } = useLiveQuery(db.select().from(photos), []);
  const session = sessionRows?.[0];
  if (!session) return null;
  const all = itemRows ?? [];
  const visible = all.filter((i) => filter === "all" || i.status === filter);
  const thumbOf = (itemId: string) => (photoRows ?? []).find((p) => p.itemId === itemId && p.type === "front")?.localUri ?? null;

  const projPct = bultoProjectedPct(all, session.totalBaleCost ?? 0);
  const realPct = bultoRealizedPct(all, session.totalBaleCost ?? 0);

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2">
          <Text className="text-[18px] text-inkdim">‹</Text>
        </Pressable>
        <Text style={{ fontFamily: FONT.display }} className="flex-1 text-[20px] text-ink" numberOfLines={1}>{session.name}</Text>
        <Badge label={session.type.toUpperCase()} />
      </View>

      {session.type === "selector" ? (
        <View className="py-3">
          <Text style={{ fontFamily: FONT.semibold, letterSpacing: 1 }} className="text-[11.5px] uppercase text-inkfaint">Projected profit</Text>
          <Text style={{ fontFamily: FONT.displayBlack, fontVariant: ["tabular-nums"] }} className="text-[34px] text-acid">{formatPeso(selectorProjected(all))}</Text>
          <View className="mt-2 flex-row gap-5">
            <View><Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[17px] text-ink">{formatPeso(selectorRealized(all))}</Text><Text className="text-[12px] text-inkfaint">realized</Text></View>
            <View><Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[17px] text-ink">{all.length}</Text><Text className="text-[12px] text-inkfaint">items</Text></View>
            <View><Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[17px] text-ink">{all.filter((i) => i.status === "sold").length}</Text><Text className="text-[12px] text-inkfaint">sold</Text></View>
          </View>
        </View>
      ) : (
        <View className="py-3">
          <Text style={{ fontFamily: FONT.semibold, letterSpacing: 1 }} className="text-[11.5px] uppercase text-inkfaint">Capital recovered</Text>
          <Text style={{ fontFamily: FONT.displayBlack, fontVariant: ["tabular-nums"] }} className="text-[34px] text-acid">{realPct == null ? "—" : formatPct(realPct)}</Text>
          <View className="my-3 h-3 overflow-visible rounded-full border border-hairline bg-surface2">
            <View className="h-full rounded-full bg-acid" style={{ width: `${Math.min(100, realPct ?? 0)}%` }} />
          </View>
          <View className="flex-row justify-between">
            <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="text-[12px] text-inkfaint">
              <Text className="text-inkdim">{formatPeso(soldRevenue(all))}</Text> of {formatPeso(session.totalBaleCost ?? 0)} bale
            </Text>
            <Text className="text-[12px] text-inkfaint">break-even ›</Text>
          </View>
          <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="mt-1.5 text-[12px] text-inkfaint">
            Projected if all sells at target: <Text style={{ fontFamily: FONT.bold }} className="text-acid">{projPct == null ? "—" : `${formatPct(projPct)} · ${formatPeso(all.reduce((a, i) => a + i.targetSellPrice, 0))}`}</Text>
          </Text>
        </View>
      )}

      <View className="flex-row gap-2 py-1">
        {(["all", "available", "sold"] as const).map((f) => (
          <Chip key={f} label={f[0].toUpperCase() + f.slice(1)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
        <View className="flex-1" />
        <Chip label="Export" selected={false} onPress={() => router.push(`/session/${id}/export`)} />
      </View>

      <FlashList
        data={visible}
        keyExtractor={(i: Item) => i.id}
        estimatedItemSize={72}
        renderItem={({ item }: { item: Item }) => {
          const uri = thumbOf(item.id);
          return (
            <Pressable onPress={() => router.push(`/item/${item.id}`)} className="flex-row items-center gap-3 border-b border-hairline py-3">
              <View className={`h-16 w-16 items-center justify-center rounded-[10px] border border-hairline bg-surface2 ${item.status === "sold" ? "opacity-45" : ""}`}>
                {uri ? <Image source={{ uri }} recyclingKey={uri} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
                     : <Text style={{ fontFamily: FONT.bold }} className="text-[20px] text-inkfaint">{item.brand[0]}</Text>}
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text style={{ fontFamily: FONT.semibold }} className={`text-[17px] ${item.status === "sold" ? "text-inkdim" : "text-ink"}`} numberOfLines={1}>{item.brand}</Text>
                  {item.status === "sold" ? <Badge label="SOLD" tone="sold" /> : null}
                </View>
                <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="mt-0.5 text-[12px] text-inkfaint">
                  {item.category} · {item.condition} · PTP {formatInches(item.ptpInches)} · L {formatInches(item.lengthInches)}
                </Text>
              </View>
              <View className="items-end">
                <Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[17px] text-ink">{formatPeso(item.soldPrice ?? item.targetSellPrice)}</Text>
                {item.status === "sold" && item.soldPrice !== item.targetSellPrice
                  ? <Text style={{ fontFamily: FONT.medium, fontVariant: ["tabular-nums"] }} className="text-[11px] text-inkfaint">listed {formatPeso(item.targetSellPrice)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-10">
            <Text style={{ fontFamily: FONT.text }} className="text-[13.5px] text-inkdim">No items yet — hit ＋ and log your first find.</Text>
          </View>
        }
      />
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label="＋  Add Item" onPress={() => router.push(`/session/${id}/add`)} />
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Verify** `pnpm typecheck` → 0; on device: both modes render correct heroes (compare against mockup screens 8–9); filters work; empty list teaches. **Step 3: Commit** `feat(app): mode-adaptive session dashboard`

---

### Task 13: Rapid Console + Camera + Go Pro wall

**Files:** Create `apps/mobile/app/session/[id]/add.tsx`, `apps/mobile/app/session/[id]/camera.tsx`

**Interfaces:**
- Consumes: `addItem`/`updateItem`/`addPhoto` (repo), `persistPhoto` (media), photo-staging bus, `Wheel`, `Chip`, `PhotoSlot`, `GoProSheet`, `FreeTierExhaustedError`, `logsRemaining`/`ensureEntitlements`.
- Produces: route `/session/[id]/add` (accepts `?item=<id>` for edit-mode prefill); camera route `/session/[id]/camera?slot=front` staging compressed URIs via the bus. Sticky values: brand/category/condition/wheels persist across saves; photos clear.

- [ ] **Step 1: Camera screen** — `apps/mobile/app/session/[id]/camera.tsx`:
```tsx
import { useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { persistPhoto } from "../../../lib/media";
import { stagePhoto, type SlotType } from "../../../lib/photo-staging";
import { FONT } from "../../../lib/theme";
import { PrimaryButton } from "../../../components/ui";

export default function CameraScreen() {
  const { slot } = useLocalSearchParams<{ slot: SlotType }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cam = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-6" style={{ paddingBottom: insets.bottom }}>
        <Text style={{ fontFamily: FONT.display }} className="text-[18px] text-ink">Camera access needed</Text>
        <Text style={{ fontFamily: FONT.text }} className="mt-2 text-center text-[13px] text-inkdim">Photos are compressed and stored on your phone only — never uploaded.</Text>
        <View className="mt-4 w-full"><PrimaryButton label="Allow Camera" onPress={requestPermission} /></View>
        <Pressable onPress={() => router.back()}><Text className="text-[13px] text-inkfaint">Not now</Text></Pressable>
      </View>
    );
  }

  const capture = async () => {
    const photo = await cam.current?.takePictureAsync();
    if (!photo) return;
    const uri = await persistPhoto(photo.uri);          // compress → move → file:// URI (file exists before any row)
    stagePhoto(slot ?? "front", uri);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back();
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-row items-center px-4 py-2">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2"><Text className="text-ink">✕</Text></Pressable>
        <Text style={{ fontFamily: FONT.display }} className="ml-3 text-[17px] text-ink">{(slot ?? "front").toUpperCase()} photo</Text>
      </View>
      <CameraView ref={cam} style={{ flex: 1, marginHorizontal: 16, borderRadius: 16, overflow: "hidden" }} />
      <Pressable onPress={capture} className="my-4 h-[74px] w-[74px] self-center rounded-full border-4 border-ink bg-surface2 p-1.5">
        <View className="flex-1 rounded-full bg-acid" />
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Rapid Console** — `apps/mobile/app/session/[id]/add.tsx`:
```tsx
import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, eq } from "drizzle-orm";
import * as Haptics from "expo-haptics";
import { db } from "../../../db/client";
import { items, entitlements } from "../../../db/schema";
import { addItem, updateItem, addPhoto } from "../../../lib/repo";
import { FreeTierExhaustedError, logsRemaining, ensureEntitlements, FREE_LOG_LIMIT } from "../../../lib/entitlements";
import { peekStagedPhotos, takeStagedPhotos, type SlotType } from "../../../lib/photo-staging";
import { CATEGORIES, CONDITIONS, FONT } from "../../../lib/theme";
import { formatPeso } from "../../../lib/format";
import { selectorProjected } from "../../../lib/math";
import { Chip, FieldLabel, PrimaryButton } from "../../../components/ui";
import { Wheel, rangeValues } from "../../../components/Wheel";
import { PhotoSlot } from "../../../components/PhotoSlot";
import { GoProSheet } from "../../../components/GoProSheet";
import { sessions } from "../../../db/schema";

const PTP = rangeValues(14, 36, 0.5);
const LEN = rangeValues(20, 36, 0.5);
const PRICE = [...rangeValues(50, 500, 10), ...rangeValues(550, 5000, 50)];
const COST = rangeValues(0, 2000, 10);
const SLOTS: SlotType[] = ["front", "back", "tag", "flaw"];

export default function RapidConsole() {
  const { id, item: editId } = useLocalSearchParams<{ id: string; item?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: sessionRows } = useLiveQuery(db.select().from(sessions).where(eq(sessions.id, id)), [id]);
  const { data: sessionItems } = useLiveQuery(db.select().from(items).where(eq(items.sessionId, id)), [id]);
  const { data: entRows } = useLiveQuery(db.select().from(entitlements), []);
  const session = sessionRows?.[0];

  // sticky values persist across saves within the screen's lifetime
  const [brand, setBrand] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [condition, setCondition] = useState<string>("9/10");
  const [ptp, setPtp] = useState(21);
  const [len, setLen] = useState(27);
  const [price, setPrice] = useState(350);
  const [cost, setCost] = useState(0);
  const [staged, setStaged] = useState<Partial<Record<SlotType, string>>>({});
  const [goPro, setGoPro] = useState(false);

  // pull staged photos whenever we regain focus from the camera
  useFocusEffect(useCallback(() => { setStaged(peekStagedPhotos()); }, []));

  // edit-mode prefill
  useEffect(() => {
    if (!editId) return;
    const existing = db.select().from(items).where(eq(items.id, editId)).all()[0];
    if (!existing) return;
    setBrand(existing.brand); setCategory(existing.category); setCondition(existing.condition);
    setPtp(existing.ptpInches); setLen(existing.lengthInches); setPrice(existing.targetSellPrice); setCost(existing.individualCost);
  }, [editId]);

  const recentBrands = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const i of db.select().from(items).orderBy(desc(items.createdAt)).all()) {
      if (!seen.has(i.brand)) { seen.add(i.brand); out.push(i.brand); }
      if (out.length >= 4) break;
    }
    return out;
  }, [sessionItems?.length]);

  if (!session) return null;
  const ent = entRows?.[0] ?? ensureEntitlements(db);
  const remaining = logsRemaining(ent);

  const save = () => {
    if (!brand.trim()) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    try {
      const input = { sessionId: id, brand: brand.trim(), category, condition, ptpInches: ptp, lengthInches: len, targetSellPrice: price, individualCost: session.type === "selector" ? cost : 0 };
      const saved = editId ? { item: updateItem(db, editId, input) } : addItem(db, input);
      const shots = takeStagedPhotos();
      for (const slot of SLOTS) { const uri = shots[slot]; if (uri) addPhoto(db, { itemId: saved.item.id, localUri: uri, type: slot }); }
      setStaged({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (editId) router.back(); // edits return to detail; new items stay for the next log (sticky values)
    } catch (e) {
      if (e instanceof FreeTierExhaustedError) { setGoPro(true); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2"><Text className="text-[18px] text-inkdim">‹</Text></Pressable>
        <Text style={{ fontFamily: FONT.display }} className="flex-1 text-[17px] text-ink" numberOfLines={1}>{session.name}</Text>
        <Text style={{ fontFamily: FONT.semibold, fontVariant: ["tabular-nums"] }} className="text-[12px] text-inkfaint">
          #{(sessionItems?.length ?? 0) + (editId ? 0 : 1)} · {formatPeso(selectorProjected(sessionItems ?? []))}
          {Number.isFinite(remaining) && remaining <= 10 ? `  ·  ${remaining} free logs left` : ""}
        </Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
        <View className="flex-row gap-2">
          {SLOTS.map((s) => (
            <PhotoSlot key={s} label={s.toUpperCase()} uri={staged[s] ?? null} onPress={() => router.push(`/session/${id}/camera?slot=${s}`)} />
          ))}
        </View>
        <FieldLabel>Brand</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {recentBrands.map((b) => <Chip key={b} label={b} selected={brand === b} onPress={() => setBrand(b)} />)}
        </ScrollView>
        <TextInput
          value={brandQuery || brand} onChangeText={(t) => { setBrandQuery(t); setBrand(t); }}
          placeholder="Search / type brand" placeholderTextColor="#8A8A8A" style={{ fontFamily: FONT.text }}
          className="mt-2 h-11 rounded-full border border-hairline bg-surface2 px-4 text-[14px] text-ink"
        />
        <FieldLabel>Category</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {CATEGORIES.map((c) => <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />)}
        </ScrollView>
        <FieldLabel>Condition</FieldLabel>
        <View className="flex-row gap-2 py-1">{CONDITIONS.map((c) => <Chip key={c} label={c} selected={condition === c} onPress={() => setCondition(c)} />)}</View>
        <FieldLabel>Pit-to-pit</FieldLabel>
        <Wheel values={PTP} value={ptp} onChange={setPtp} unit={'PTP "'} />
        <View className="h-2" />
        <Wheel values={LEN} value={len} onChange={setLen} unit={'L "'} />
        {session.type === "selector" ? (<>
          <FieldLabel>Cost · Price</FieldLabel>
          <View className="flex-row gap-2">
            <View className="flex-1"><Wheel values={COST} value={cost} onChange={setCost} unit="COST ₱" /></View>
            <View className="flex-[1.4]"><Wheel values={PRICE} value={price} onChange={setPrice} unit="₱" /></View>
          </View>
        </>) : (<>
          <FieldLabel>Target price</FieldLabel>
          <Wheel values={PRICE} value={price} onChange={setPrice} unit="₱" />
        </>)}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label={editId ? "Save changes  ✓" : "Save + Next  ✓"} onPress={save} />
      </View>
      <GoProSheet visible={goPro} onClose={() => setGoPro(false)} />
    </View>
  );
}
```

- [ ] **Step 3: Verify on device** — log 3 items in under 30s with sticky values; photos land in slots after camera round-trip; in a jest-free sanity check set `logsUsed` to 19 via a temporary dev tweak and confirm the Go Pro sheet appears on the 21st save attempt and **no item row is created**. `pnpm typecheck` → 0. **Step 4: Commit** `feat(app): rapid console, camera capture, free-tier wall`

---

### Task 14: Item Detail + Mark Sold + Delete

**Files:** Create `apps/mobile/app/item/[id]/index.tsx`, `apps/mobile/app/item/[id]/sold.tsx`

**Interfaces:**
- Consumes: repo (`markSold`, `unmarkSold`, `deleteItem`), media (`deleteFiles`), live queries, ui kit, `Wheel`.
- Produces: routes `/item/[id]` and modal `/item/[id]/sold`. Delete = `Alert.alert` confirm → `deleteItem` → `deleteFiles(photoUris)` → back. Edit routes to `/session/[sessionId]/add?item=[id]`.

- [ ] **Step 1: Item Detail** — `apps/mobile/app/item/[id]/index.tsx`:
```tsx
import { View, Text, Pressable, Alert, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { items, photos } from "../../../db/schema";
import { unmarkSold, deleteItem } from "../../../lib/repo";
import { deleteFiles } from "../../../lib/media";
import { FONT } from "../../../lib/theme";
import { formatPeso, formatInches } from "../../../lib/format";
import { Badge, PrimaryButton, SecondaryButton } from "../../../components/ui";

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: itemRows } = useLiveQuery(db.select().from(items).where(eq(items.id, id)), [id]);
  const { data: photoRows } = useLiveQuery(db.select().from(photos).where(eq(photos.itemId, id)), [id]);
  const item = itemRows?.[0];
  if (!item) return null;
  const pics = photoRows ?? [];

  const confirmDelete = () =>
    Alert.alert("Delete item?", "Photos on this item are removed from your phone too.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { const { photoUris } = deleteItem(db, id); deleteFiles(photoUris); router.back(); } },
    ]);

  const Row = ({ k, v, acid }: { k: string; v: string; acid?: boolean }) => (
    <View className="flex-row justify-between border-b border-hairline py-3">
      <Text style={{ fontFamily: FONT.text }} className="text-[15px] text-inkfaint">{k}</Text>
      <Text style={{ fontFamily: FONT.semibold, fontVariant: ["tabular-nums"] }} className={`text-[15px] ${acid ? "text-acid" : "text-ink"}`}>{v}</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2"><Text className="text-[18px] text-inkdim">‹</Text></Pressable>
        <Text style={{ fontFamily: FONT.display }} className="flex-1 text-[20px] text-ink" numberOfLines={1}>{item.brand} {item.category}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} className="rounded-[14px]">
          {(pics.length ? pics : [null]).map((p, idx) => (
            <View key={p?.id ?? idx} className="mr-2 h-72 w-80 items-center justify-center overflow-hidden rounded-[14px] border border-hairline bg-surface2">
              {p ? (<>
                <Image source={{ uri: p.localUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                <View className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-0.5"><Text style={{ fontFamily: FONT.semibold }} className="text-[11px] text-inkdim">{p.type.toUpperCase()}</Text></View>
              </>) : <Text style={{ fontFamily: FONT.bold }} className="text-[48px] text-hairline">{item.brand[0]}</Text>}
            </View>
          ))}
        </ScrollView>
        <View className="mt-2">
          <Row k="Condition" v={item.condition} />
          <Row k="Size" v={`PTP ${formatInches(item.ptpInches)} · L ${formatInches(item.lengthInches)}`} />
          {item.individualCost > 0 ? <Row k="Cost" v={formatPeso(item.individualCost)} /> : null}
          <Row k="Target price" v={formatPeso(item.targetSellPrice)} acid />
          {item.status === "sold" ? <Row k="Sold for" v={formatPeso(item.soldPrice ?? 0)} acid /> : null}
          <View className="flex-row justify-between py-3">
            <Text style={{ fontFamily: FONT.text }} className="text-[15px] text-inkfaint">Status</Text>
            <Badge label={item.status.toUpperCase()} tone={item.status === "sold" ? "sold" : "default"} />
          </View>
        </View>
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        {item.status === "available"
          ? <PrimaryButton label="Mark Sold" onPress={() => router.push(`/item/${id}/sold`)} />
          : <PrimaryButton label="Undo sold" onPress={() => unmarkSold(db, id)} />}
        <View className="mb-2 flex-row gap-2">
          <SecondaryButton label="Edit" onPress={() => router.push(`/session/${item.sessionId}/add?item=${id}`)} />
          <SecondaryButton label="Delete" danger onPress={confirmDelete} />
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Mark Sold modal** — `apps/mobile/app/item/[id]/sold.tsx`:
```tsx
import { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { items } from "../../../db/schema";
import { markSold } from "../../../lib/repo";
import { FONT } from "../../../lib/theme";
import { formatPeso } from "../../../lib/format";
import { FieldLabel, PrimaryButton } from "../../../components/ui";
import { Wheel, rangeValues } from "../../../components/Wheel";

export default function MarkSoldScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const item = db.select().from(items).where(eq(items.id, id)).all()[0];
  const [price, setPrice] = useState(item?.targetSellPrice ?? 0);
  if (!item) return null;
  const values = rangeValues(Math.max(10, item.targetSellPrice - 500), item.targetSellPrice + 500, 10);

  return (
    <View className="flex-1 bg-surface1 px-4 pt-3">
      <View className="mb-3 h-1 w-11 self-center rounded-full bg-hairline" />
      <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">Mark Sold</Text>
      <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="mb-3 mt-0.5 text-[12.5px] text-inkfaint">
        Listed at {formatPeso(item.targetSellPrice)} — set the final price if you haggled.
      </Text>
      <FieldLabel>Sold for</FieldLabel>
      <Wheel values={values} value={price} onChange={setPrice} unit="₱" format={(v) => v.toLocaleString("en-PH")} />
      <PrimaryButton label="Confirm Sale  ✓" onPress={() => { markSold(db, id, price); router.back(); }} />
      <Text style={{ fontFamily: FONT.text }} className="text-center text-[11.5px] text-inkfaint">Records price + date. Undo anytime from the item.</Text>
    </View>
  );
}
```

- [ ] **Step 3: Verify on device** — mark sold at wheel-adjusted price; realized totals update live on dashboard; undo restores; delete removes row + files (check via re-open). `pnpm typecheck` → 0. **Step 4: Commit** `feat(app): item detail, mark-sold sheet, delete flow`

---

### Task 15: IG Export screen

**Files:** Create `apps/mobile/app/session/[id]/export.tsx`

**Interfaces:**
- Consumes: `formatCaption`, live item query, `expo-clipboard`, ui kit.
- Produces: route `/session/[id]/export` — checklist defaulting to all **available** items, live caption preview, `Copy to Clipboard` + success haptic/toast text. Read-only: never mutates items.

- [ ] **Step 1: Install** `pnpm -C apps/mobile exec npx expo install expo-clipboard`

- [ ] **Step 2: Implement**
```tsx
import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import { items } from "../../../db/schema";
import { formatCaption } from "../../../lib/caption";
import { formatPeso } from "../../../lib/format";
import { FONT } from "../../../lib/theme";
import { Badge, FieldLabel, PrimaryButton } from "../../../components/ui";

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: itemRows } = useLiveQuery(db.select().from(items).where(eq(items.sessionId, id)).orderBy(desc(items.createdAt)), [id]);
  const all = itemRows ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => { setSelected(new Set(all.filter((i) => i.status === "available").map((i) => i.id))); }, [itemRows?.length]);

  const chosen = all.filter((i) => selected.has(i.id));
  const caption = formatCaption(chosen);
  const toggle = (itemId: string) => setSelected((prev) => { const n = new Set(prev); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n; });
  const copy = async () => { await Clipboard.setStringAsync(caption); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setCopied(true); setTimeout(() => setCopied(false), 2500); };

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 pb-2 pt-3">
        <Pressable hitSlop={8} onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface2"><Text className="text-[18px] text-inkdim">‹</Text></Pressable>
        <Text style={{ fontFamily: FONT.display }} className="flex-1 text-[20px] text-ink">IG Drop</Text>
        <Badge label={`${chosen.length} SELECTED`} />
      </View>
      <ScrollView className="max-h-56">
        {all.map((i) => (
          <Pressable key={i.id} onPress={() => toggle(i.id)} className="flex-row items-center gap-3 border-b border-hairline py-3">
            <View className={`h-6 w-6 items-center justify-center rounded-lg border ${selected.has(i.id) ? "border-acid bg-acid" : "border-hairline"}`}>
              {selected.has(i.id) ? <Text style={{ fontFamily: FONT.bold }} className="text-[13px] text-acidink">✓</Text> : null}
            </View>
            <Text style={{ fontFamily: FONT.semibold }} className={`flex-1 text-[15px] ${selected.has(i.id) ? "text-ink" : "text-inkdim"}`} numberOfLines={1}>{i.brand} {i.category}</Text>
            <Text style={{ fontFamily: FONT.bold, fontVariant: ["tabular-nums"] }} className="text-[15px] text-ink">{formatPeso(i.targetSellPrice)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FieldLabel>Caption preview</FieldLabel>
      <ScrollView className="flex-1 rounded-card border border-hairline bg-surface1 px-4 py-3">
        <Text style={{ fontFamily: FONT.text, fontVariant: ["tabular-nums"] }} className="text-[13.5px] leading-[22px] text-inkdim">{caption || "Select items to build the drop caption."}</Text>
      </ScrollView>
      {copied ? (
        <View className="absolute bottom-28 left-6 right-6 flex-row items-center gap-2 rounded-card border border-hairline bg-surface2 px-4 py-3">
          <Text className="text-acid">✓</Text><Text style={{ fontFamily: FONT.semibold }} className="text-[14px] text-ink">Copied {chosen.length} listings to clipboard</Text>
        </View>
      ) : null}
      <View style={{ paddingBottom: insets.bottom + 4 }}>
        <PrimaryButton label="Copy to Clipboard" onPress={copy} disabled={chosen.length === 0} />
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Verify on device** — copy, paste into any note/IG draft: exact template incl. `---` separators and `"Mine"` quotes. `pnpm typecheck` → 0. **Step 4: Commit** `feat(app): IG drop export with clipboard`

---

### Task 16: Full-suite gate, dev seed, QA checklist

**Files:** Create `apps/mobile/scripts/seed-dev.ts`, `docs/qa/mobile-mvp-checklist.md`

**Interfaces:** none downstream — this is the release gate for Phase A.

- [ ] **Step 1: Dev seed** — `apps/mobile/scripts/seed-dev.ts` (run manually in a dev build console or temporarily imported in `_layout`; guarded so it never ships enabled):
```ts
import { db } from "../db/client";
import { createSession, addItem, markSold } from "../lib/repo";
import { ensureEntitlements } from "../lib/entitlements";

export function seedDev() {
  if (!__DEV__) return;
  ensureEntitlements(db);
  const s1 = createSession(db, { name: "Baguio Weekend", type: "selector", location: "Baguio Night Market" });
  const a = addItem(db, { sessionId: s1.id, brand: "Stüssy", category: "Tee", ptpInches: 21, lengthInches: 27, condition: "9/10", individualCost: 100, targetSellPrice: 550 }).item;
  addItem(db, { sessionId: s1.id, brand: "Carhartt", category: "Hoodie", ptpInches: 24, lengthInches: 28, condition: "9/10", individualCost: 120, targetSellPrice: 750 });
  markSold(db, a.id, 500);
  const s2 = createSession(db, { name: "Naga Run #4", type: "bulto", location: "Naga City Downtown", totalBaleCost: 10000 });
  addItem(db, { sessionId: s2.id, brand: "Nike", category: "Tee", ptpInches: 21.5, lengthInches: 27, condition: "9/10", targetSellPrice: 350 });
}
```

- [ ] **Step 2: QA checklist** — `docs/qa/mobile-mvp-checklist.md`:
```md
# Mobile MVP — device QA (run in AIRPLANE MODE end-to-end)
- [ ] Fresh install: empty state → create Selector session → log 3 items < 30s total (sticky values working)
- [ ] Wheels tick haptically per detent; chips haptic on select; SAVE double-buzz on success
- [ ] Camera: capture all 4 slots; thumbnails appear; kill app mid-capture → relaunch → no broken rows; orphan file swept (log sweepOrphans count)
- [ ] Photos live in <documents>/latag_media/*.jpg ≤ ~350KB each (1200px JPEG 0.7)
- [ ] Bulto session: bale wheel in New Session; dashboard shows recovery %, break-even bar, projected line; cost wheel hidden in console
- [ ] Mark sold below target → realized reflects actual; undo restores; sold rows dim with "listed" price
- [ ] Delete item: confirm dialog → row gone, files gone
- [ ] IG export: default = available only; caption paste matches template exactly
- [ ] Free tier: set logsUsed=19 (dev) → indicator shows "1 free logs left"; next save works; the one after opens Go Pro sheet and inserts nothing
- [ ] prefers-reduced-motion (OS setting): no scale/slide animations misbehave
- [ ] 6-hour battery sanity: screen-on black theme, no unexpected wakelocks
```

- [ ] **Step 3: Full gate** — Run: `pnpm -C apps/mobile test` (all suites) → PASS; `pnpm typecheck` → 0; walk the QA checklist on a physical device.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: dev seed, device QA checklist — Phase A complete"
```

---

## Self-Review (performed)

- **Spec coverage:** every MVP spec section maps to a task — screens 4.1–4.7 → Tasks 11–15; schema 5.1 → Task 3; math 5.3 → Task 5; media 5.4 → Task 9 + camera in 13; error handling 6 → repo transactions (8), console error haptics (13), delete confirm (14), placeholder tiles (12/14), bale-0 `—` (5/12); free tier (platform spec §2) → Tasks 7, 8, 13; monorepo (platform spec §6.1) → Task 1; testing 8 → TDD tasks + Task 16 checklist. Deferred by spec: telemetry, auth, Reanimated flash animation polish (basic active-scale + haptics ship now; the acid SAVE sweep rides the first polish pass).
- **Placeholder scan:** none — every step has code or an exact command.
- **Type consistency:** `DB`/`AnyDb` pattern is explicit (drizzle's expo vs better-sqlite3 client types diverge; repo functions accept the sync API both provide — the tests pin behavior). `logsRemaining` naming consistent across Tasks 7/8/13. `formatInches`/`formatPeso` usage matches Task 4 signatures.
```
