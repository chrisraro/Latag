# F2 — Storefront: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD every logic module (RED first). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sellers publish chosen items to a public shop page; buyers browse it and inquire. Mobile ships OTA; web ships via Vercel; one additive Supabase migration.

**Architecture:** Three seams. `lib/shop-api.ts` owns every Supabase call (the only new network file). `lib/shop-sync.ts` owns a local queue whose drain logic is a pure, testable state machine. UI never calls Supabase directly — it enqueues. The web app reads published rows through public RLS with no auth at all.

**Tech Stack:** Supabase (Postgres + Storage), drizzle/expo-sqlite, supabase-js, Next.js 16 (App Router, ISR), Tailwind v4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-latag-phase-f-inventory-storefront-design.md` §3 (+ §1 privacy repositioning) is law.
- **Mobile is JS-only** (no package.json/app.json changes) so it ships OTA. Web MAY add pure-JS deps.
- **Privacy boundary is structural**: `shop_items` has NO column for cost, profit, location, or batch. Never add one. Only published items sync; nothing uploads without an explicit per-item action.
- **Offline-first**: publishing NEVER blocks the UI or the logging loop. Every network failure enqueues/retries silently and surfaces as an honest pending count. New sanctioned network files: `lib/shop-api.ts`, `lib/shop-sync.ts`.
- **Design (mobile)**: Warehouse Console tokens (`lib/theme.ts`), screen `px-5`, rows `px-3 py-3.5`, cards 18px interiors, sheets per existing chrome, 44px targets, a11y labels, explicit lineHeight on ≤13px text.
- **Design (web)**: existing tokens in `apps/web/app/globals.css` (black `#000`, acid `#B8F135`, Archivo via next/font). Craft rules: floating glass pill nav; item grid uses `grid-flow-dense` (never leave holes); product cards use `group-hover:scale-105 transition-transform duration-700 ease-out` inside `overflow-hidden`; H1 max 2–3 lines via wide container + `clamp()`; generous section rhythm (`py-20 md:py-28`); NO meta-labels ("SECTION 01"); button text contrast must be legible (acid bg → `#141A05` text); wrap pages in `overflow-x-hidden`. NO GSAP, NO pinned-scroll theatrics — a buyer scanning stock needs speed. NO emojis in code.
- Gates per task from `apps/mobile` (mobile tasks): `pnpm test` green (303+, never shrinking) · `npx tsc --noEmit` 0 · `npx expo export --platform android` ok (delete `dist/`). Web tasks from `apps/web`: `pnpm test` green · `npx tsc --noEmit` 0 · `pnpm build` succeeds.
- Commit per task with the plan's exact message; do NOT push. Branch: `feat/phase-f2-storefront`. Repo root path has a space — quote it.

---

### Task 1: Supabase migration file

**Files:** Create `supabase/migrations/0003_storefront.sql`

Write the SQL only — **the coordinator applies it** (needs the management token). It must be idempotent-safe to read and reviewable line by line.

- [ ] **Step 1: Write the migration.** Requirements, exactly:
  - `create extension if not exists citext;`
  - `shops`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null unique references auth.users(id) on delete cascade`, `handle citext not null unique check (handle ~ '^[a-z0-9-]{3,20}$')`, `display_name text not null`, `bio text`, `contact_messenger text`, `contact_instagram text`, `contact_email text`, `show_sold boolean not null default false`, `is_published boolean not null default true`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
  - `shop_items`: `id uuid pk default gen_random_uuid()`, `shop_id uuid not null references public.shops(id) on delete cascade`, `code text not null`, `item_local_id text not null`, `brand text not null`, `name text`, `department text not null`, `category text not null`, `condition text not null`, `specs jsonb not null default '{}'::jsonb`, `price integer not null`, `status text not null default 'available' check (status in ('available','sold'))`, `photo_urls text[] not null default '{}'`, `sort_order integer not null default 0`, `published_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, plus `unique (shop_id, item_local_id)` and `unique (shop_id, code)`.
  - Index: `create index shop_items_shop_status_idx on public.shop_items (shop_id, status);`
  - RLS on both tables. Policies:
    - `create policy "public shops" on public.shops for select using (is_published);`
    - `create policy "own shop all" on public.shops for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`
    - `create policy "public shop items" on public.shop_items for select using (exists (select 1 from public.shops s where s.id = shop_id and s.is_published and (shop_items.status = 'available' or s.show_sold)));`
    - `create policy "own shop items all" on public.shop_items for all using (exists (select 1 from public.shops s where s.id = shop_id and s.user_id = auth.uid())) with check (exists (select 1 from public.shops s where s.id = shop_id and s.user_id = auth.uid()));`
  - Storage bucket via insert (buckets cannot be created with plain DDL): `insert into storage.buckets (id, name, public) values ('shop-photos','shop-photos', true) on conflict (id) do nothing;` plus policies on `storage.objects` for that bucket: public `select`; `insert`/`update`/`delete` restricted to `bucket_id = 'shop-photos' and (storage.foldername(name))[1] = auth.uid()::text`.
  - `updated_at` trigger function `public.touch_updated_at()` (`security definer`, `set search_path = public`) + triggers on both tables. Follow `0002_harden_definer_functions.sql`: `revoke execute on function public.touch_updated_at() from anon, authenticated, public;`
- [ ] **Step 2: Commit** — `feat(db): storefront schema — shops, shop_items, photo bucket, RLS`

---

### Task 2: Local schema + publish state (TDD)

**Files:** Modify `apps/mobile/db/schema.ts`; generate `apps/mobile/drizzle/0003_*.sql`; Modify `apps/mobile/tests/schema.test.ts`; Modify `apps/mobile/lib/repo.ts`, `apps/mobile/tests/repo.test.ts`

**Interfaces:**
- `items` += `publishedAt: integer("published_at", { mode: "timestamp" })` (null = not published) and `shopCode: text("shop_code")` (the `LT-XXXXX` shown to buyers).
- New table `publishQueue` = `sqliteTable("publish_queue", { id: text("id").primaryKey(), itemId: text("item_id").notNull(), op: text("op", { enum: ["upsert","delete"] }).notNull(), attempts: integer("attempts").notNull().default(0), lastError: text("last_error"), createdAt: integer("created_at", { mode: "timestamp" }).notNull() })` + `export type PublishQueueRow`.
- Repo produces: `enqueuePublish(db, itemId, op)` (replaces any existing row for that item — last write wins), `dequeuePublish(db, id)`, `listPublishQueue(db)`, `bumpAttempt(db, id, error)`, `markPublished(db, itemId, code)`, `markUnpublished(db, itemId)`, `generateShopCode()` → `LT-` + 5 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no ambiguous 0/O/1/I/L).

- [ ] Failing migration-integrity test (old items row survives 0003 with `published_at`/`shop_code` null; publish_queue accepts a row) → RED → schema edit → `npx drizzle-kit generate` → **READ the generated SQL** (expect pure ADD COLUMNs + CREATE TABLE; if it rebuilds `items`, verify column-by-column against 0002 exactly as F1's predecessor did) → GREEN.
- [ ] Failing repo tests: enqueue twice for one item leaves ONE row with the latest op; `markPublished` sets both fields; `markUnpublished` nulls both; `generateShopCode` matches `/^LT-[A-Z2-9]{5}$/` and excludes `0O1IL` across 500 generations → RED → implement → GREEN.
- [ ] Commit — `feat(mobile): publish state — item publish fields, publish queue, shop codes`

---

### Task 3: `lib/shop-api.ts` (TDD with mocked supabase)

**Files:** Create `apps/mobile/lib/shop-api.ts`, `apps/mobile/tests/shop-api.test.ts`

**Interfaces:**
```ts
export type ShopProfile = { handle: string; displayName: string; bio: string | null;
  contactMessenger: string | null; contactInstagram: string | null; contactEmail: string | null; showSold: boolean };
export type ShopResult<T> = { ok: true; data: T } | { ok: false; reason: "auth" | "taken" | "network" | "error"; message: string };
export function normalizeHandle(raw: string): string;                 // lowercase, spaces→'-', strip invalid, clamp 20
export function isValidHandle(h: string): boolean;                    // ^[a-z0-9-]{3,20}$
export async function checkHandleAvailable(h: string): Promise<ShopResult<boolean>>;
export async function getMyShop(): Promise<ShopResult<ShopProfile | null>>;
export async function saveMyShop(p: ShopProfile): Promise<ShopResult<ShopProfile>>;   // upsert on user_id; unique violation (23505) → reason "taken"
export async function uploadItemPhotos(itemId: string, localUris: string[]): Promise<ShopResult<string[]>>; // ≤4; returns public URLs
export async function upsertShopItem(row: ShopItemUpsert): Promise<ShopResult<null>>; // onConflict "shop_id,item_local_id"
export async function deleteShopItem(itemLocalId: string): Promise<ShopResult<null>>; // also removes its storage folder
```
`ShopItemUpsert` = `{ itemLocalId, code, brand, name, department, category, condition, specs: Record<string, number|string|null>, price, status, photoUrls, sortOrder }`.
Rules: every function catches everything and returns a `ShopResult` — **never throws**. No session → `reason:"auth"`. Upload path is `{user_id}/{itemLocalId}/{index}.jpg`; read local files with `expo-file-system` (legacy import, matching `lib/media.ts`) as base64 → `decode` to `ArrayBuffer` for `supabase.storage.upload` with `contentType: "image/jpeg"`, `upsert: true`.

- [ ] TDD with `jest.mock("./supabase")` (follow the mocking style already in `tests/license.test.ts`): handle normalization/validation table; `checkHandleAvailable` true/false/network; `saveMyShop` maps a 23505 to `taken`; `uploadItemPhotos` caps at 4 and returns URLs in order; every function returns `{ok:false}` rather than throwing when the mock rejects.
- [ ] Commit — `feat(mobile): shop API — profile, handle checks, photo upload, item upsert`

---

### Task 4: `lib/shop-sync.ts` — queue drain (TDD)

**Files:** Create `apps/mobile/lib/shop-sync.ts`, `apps/mobile/tests/shop-sync.test.ts`; Modify `apps/mobile/app/_layout.tsx`

**Interfaces:**
```ts
export type DrainDeps = { list: () => PublishQueueRow[]; upsert: (r: PublishQueueRow) => Promise<ShopResult<null>>;
  remove: (r: PublishQueueRow) => Promise<ShopResult<null>>; done: (id: string) => void; fail: (id: string, msg: string) => void };
export type DrainSummary = { processed: number; succeeded: number; failed: number; gaveUp: number };
export const MAX_ATTEMPTS = 5;
export async function drainQueue(deps: DrainDeps): Promise<DrainSummary>;
export function pendingLabel(n: number): string;   // 0 → "" · 1 → "1 change pending" · n → "N changes pending"
```
Rules: process rows oldest-first; `op:"upsert"` → `upsert`, `op:"delete"` → `remove`; success → `done(id)` (row leaves the queue); failure → `fail(id, msg)`; a row already at `MAX_ATTEMPTS` is counted in `gaveUp` and left alone (never retried, never lost — the Shop tab can surface it). `reason:"auth"` stops the drain immediately (no point burning attempts while signed out) — remaining rows stay queued. Never throws.

- [ ] TDD: empty queue → zeroes; mixed ops all succeed; one failure increments and continues others; auth failure halts after the first row; a row at MAX_ATTEMPTS is skipped and counted as `gaveUp`.
- [ ] Wire into `app/_layout.tsx`: one effect gated on `migrated` that drains once on launch, plus an `AppState` "active" listener that drains again on foreground. Fire-and-forget, all failures swallowed. Do NOT touch the migrations/fonts/splash/deep-link/notification/OTA effects.
- [ ] Commit — `feat(mobile): publish sync — queue drain with retry, launch + foreground triggers`

---

### Task 5: Shop tab

**Files:** Modify `apps/mobile/app/(tabs)/shop.tsx`; Create `apps/mobile/app/shop/setup.tsx` (modal route, register in `app/_layout.tsx` Stack); Create `apps/mobile/tests/shop-tab.test.tsx`

**States, all of which must be designed (no dead ends):**
1. **Free user** — value proposition card: `Storefront` icon tile, "Your own shop page", body "Publish items to a public page buyers can browse — share one link on FB, IG, or Messenger.", `PrimaryButton "Unlock with Pro"` → existing `GoProSheet` (this is its new job).
2. **Pro, no shop yet** — same pitch, `PrimaryButton "Set up my shop"` → `/shop/setup`.
3. **Pro, shop exists** — header card with `latag.vercel.app/shop/{handle}`, a **Copy link** secondary and a **Share** secondary (`Share.share` from react-native, already available); counts row ("12 published · 3 sold"); `pendingLabel` line when the queue is non-empty (11.5px inkfaint); rows listing published items (thumb, brand · name, `LT-` code, price) each tappable to its item detail; `SecondaryButton "Edit shop"` → `/shop/setup?edit=1`.
- **Setup screen** (`/shop/setup`): FieldLabel'd inputs — handle (live availability via `checkHandleAvailable`, debounced 500ms, showing "Checking… / Available / Taken" in inkfaint/acid/danger, prefix `latag.vercel.app/shop/` rendered inline as inkfaint), display name, bio (multiline, 160 max), then a CONTACTS section: Messenger username, Instagram username, email — each with a `.field` input and a one-line helper explaining what buyers see. Save via `saveMyShop`; success toast "Shop saved"; `taken` → inline danger under the handle field; `auth` → "Sign in first to set up your shop".
- [ ] TDD the screen states with the established `useLiveQuery`/mock pattern from `tests/sessions-screen.test.tsx` + `jest.mock("../lib/shop-api")`.
- [ ] Commit — `feat(mobile): shop tab — setup, handle picker, published list, share link`

---

### Task 6: Publish toggle on item detail

**Files:** Modify `apps/mobile/app/item/[id]/index.tsx`; Modify `apps/mobile/lib/repo.ts` (+ tests) so item edits/sold/delete enqueue when published

**Behaviour:**
- A row under the actions: `Storefront` icon + "Published to shop" + a `toggle` (reuse the mockup toggle styling: 46×28 pill, acid when on). Free/no-shop users see it disabled with an inkfaint helper "Set up your shop to publish" that routes to the Shop tab on tap.
- Turning ON: `markPublished(db, id, generateShopCode())` (only if no code yet — codes are stable forever) → `enqueuePublish(db, id, "upsert")` → toast "Publishing — your shop updates shortly"; when the queue drains it becomes live. Turning OFF: `markUnpublished` → `enqueuePublish(db, id, "delete")` → toast "Removed from shop".
- When published, show the `LT-XXXXX` code (12px inkfaint, tabular) and a "Copy item link" secondary.
- **Auto-sync wiring** in `repo.ts`: `updateItem`, `markSold`, `unmarkSold`, and `deleteItem` must enqueue an `upsert` (or `delete` for deletion) whenever the row has `publishedAt != null`. TDD each of those four paths.
- [ ] Commit — `feat(mobile): publish items to shop — toggle, codes, auto-sync on change`

---

### Task 7: Public shop pages (web)

**Files:** Create `apps/web/app/shop/[handle]/page.tsx`, `apps/web/app/shop/[handle]/[item]/page.tsx`, `apps/web/app/shop/[handle]/opengraph-image.tsx`, `apps/web/app/shop/[handle]/[item]/opengraph-image.tsx`, `apps/web/lib/shop-queries.ts`, `apps/web/lib/inquiry.ts` + `apps/web/tests/inquiry.test.ts`; Modify `apps/web/app/sitemap.ts`

**Interfaces (`lib/inquiry.ts`, TDD — this is F3's logic landing early because the buttons live here):**
```ts
export function inquiryMessage(i: { code: string; brand: string; name: string | null; condition: string; price: number; url: string }): string;
export function messengerHref(handle: string, message: string): string;   // https://m.me/{handle}?text={encoded}
export function instagramHref(handle: string): string;                    // https://ig.me/m/{handle}
export function instagramWebHref(handle: string): string;                 // https://www.instagram.com/{handle}
export function mailtoHref(email: string, subject: string, body: string): string;
export function inquirySubject(i: { brand: string; name: string | null; code: string }): string;
```
Message format (verbatim, spec §4):
```
[LT-7K2Q9] Hi! Is this still available?
Carhartt Detroit Jacket — 9/10 — ₱850
https://latag.vercel.app/shop/{handle}/{item}
```

**Shop page** — floating glass pill nav (matches the mobile tab bar: `backdrop-blur`, `bg-white/5`, `border border-hairline`, `rounded-full`, sticky top with the Latag mark + the seller's handle); seller header (display name in Archivo Expanded, `clamp(2rem,4vw,3.25rem)`, **max 2 lines**, wide container `max-w-5xl`, bio in inkdim, department filter chips); then the grid: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 grid-flow-dense gap-4` with `overflow-hidden rounded-card` cards whose images use `group-hover:scale-105 transition-transform duration-700 ease-out`, price in acid, condition badge, `SOLD` overlay when applicable. Section rhythm `py-20 md:py-28`. Empty shop → honest "No items listed yet." No meta-labels anywhere. Page wrapped in `overflow-x-hidden`.

**Item page** — photo carousel (CSS scroll-snap, no JS library), title `Brand · Name`, price large in acid, spec table from `specs` jsonb, the `LT-` code, then the three inquiry buttons (Messenger acid/`#141A05` text, Instagram and Email as bordered secondaries) each with a `data-message` attribute; a tiny client component copies the message to the clipboard on click for ALL THREE and shows "Message copied" — then follows the href. Instagram button additionally renders the message as selectable text on desktop (where `ig.me` dead-ends) — detect via CSS `md:` breakpoint, no user-agent sniffing. Footer: "Made with Latag" linking home.

**Data**: `lib/shop-queries.ts` uses the existing anon Supabase client (public RLS, no auth). `export const revalidate = 60;` on both pages; `generateStaticParams` returns `[]` (fully dynamic-on-demand). 404 via `notFound()` when the handle or item does not exist.

- [ ] TDD `lib/inquiry.ts` first (encoding, exact message shape, all four href builders) → then build pages.
- [ ] Commit — `feat(web): public seller storefronts — shop grid, item pages, inquiry routing`

---

### Task 8: Privacy repositioning copy sweep

**Files:** `apps/web/app/page.tsx`, `apps/web/app/privacy/page.tsx`, `apps/web/app/data/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/app/layout.tsx` (metadata description), `apps/mobile/app/onboarding.tsx`, `apps/mobile/app/welcome.tsx`, `apps/mobile/app/(tabs)/settings.tsx`

Spec §1 requires this and no other task carries it: the product now uploads published items, so **every absolute claim must become the conditional promise** — "nothing leaves your phone **unless you publish it**". Shipping a storefront while the privacy page still says "never uploaded" would be a false statement to users, not a copy nit.

- [ ] **Step 1: Find every claim.** From the repo root:

```bash
grep -rniE "never leave|never upload|100% offline|no servers|stays on your phone|nothing is ever" apps/web/app apps/mobile/app apps/mobile/components
```

Expect ~8 hits (the count at spec time). Every one must be visited — none may be left as an unqualified absolute.

- [ ] **Step 2: Rewrite each to the sharpened promise.** The distinction to preserve everywhere: **inventory, photos, costs and margins are local by default; only items you explicitly publish are uploaded, and published items carry no cost or profit data.** Examples of correct replacements:
  - Landing hero/feature: "Works 100% offline" → "Works 100% offline — your stock, costs and margins never leave your phone unless you publish an item to your shop."
  - Onboarding privacy card: "Photos stay on your phone / Compressed and stored on-device. Nothing is ever uploaded." → "Your inventory stays on your phone / Costs and margins never leave it. Only items you publish to your shop go online."
  - Settings "Offline-first" row subtitle: "Inventory, photos & math never leave this phone" → "Inventory, costs & math stay on this phone — only published items go online".
  - Welcome feature row: keep "100% offline after activation" only if paired with the publish caveat elsewhere on the screen; otherwise reword.
- [ ] **Step 3: Privacy + Data pages get a real section**, not a tweak: what is uploaded when you publish (brand, name, category, condition, measurements, price, photos), what is never uploaded (cost, profit, supplier location, batch data, unpublished items), where it lives (Supabase, PH-region CDN), and how to remove it (unpublish → row and photos deleted). Terms gains a line that sellers are responsible for their listing content.
- [ ] **Step 4: Re-run the grep** — every surviving hit must be paired with the publish caveat in the same sentence or the adjacent line. Gates for both apps.
- [ ] **Step 5: Commit** — `docs(copy): sharpen the privacy promise for publishing — nothing leaves unless you publish`

---

### Task 9: F2 gate

**Files:** `docs/qa/mobile-mvp-checklist.md` (+ Phase F2 section), spec §3/§4 SHIPPED marks, `.superpowers/sdd/progress.md`

- [ ] QA lines: set up a shop (handle taken path too); publish an item → appears at the public URL within a minute; sell it in-app → drops off the shop; unpublish → gone; airplane mode publish → "changes pending", syncs on reconnect; Free user sees the Pro gate; shop link copies/shares; **inquiry buttons on a real Android AND a real iPhone — confirm Messenger opens WITH the message pre-filled (un-sent), Instagram opens the DM with the message on the clipboard, email opens a pre-drafted mail**; desktop Instagram fallback shows copyable text; OG previews render when the link is pasted into Messenger.
- [ ] Full gates both apps. Commit — `chore: F2 QA + spec update — F2 complete`
- [ ] Coordinator afterwards: apply migration 0003 · whole-phase review · fixes · merge · `eas update` (bundle-grep for the Supabase host + `shop`) · Vercel deploy verification.

## Self-Review Notes

- **Spec coverage:** §1 privacy repositioning → T8 (added 2026-07-27 — it was unassigned); §3 schema/RLS/bucket → T1; local publish state → T2; API + upload → T3; sync engine + pending count → T4; shop setup/manager + Pro gate → T5; per-item opt-in + auto-sync → T6; web shop/item/OG/sitemap → T7; QA/docs → T8. **Spec §4 (F3)** lands inside T7 because the buttons and their logic are the same deliverable — F3 therefore collapses into F2 rather than becoming a third branch.
- **Type consistency:** `ShopResult`/`ShopProfile`/`ShopItemUpsert` (T3) consumed by T4/T5/T6; `PublishQueueRow` (T2) consumed by T4; `enqueuePublish`/`markPublished`/`generateShopCode` (T2) consumed by T6; `inquiryMessage` + href builders (T7) used only in T7.
- **Riskiest areas flagged for the reviewer:** (a) RLS correctness — a wrong policy leaks unpublished stock or blocks the seller's own writes; (b) the privacy boundary — verify no cost/profit/location field can reach `shop_items` through any path; (c) queue idempotency — a retried upsert must not duplicate rows or photos.
