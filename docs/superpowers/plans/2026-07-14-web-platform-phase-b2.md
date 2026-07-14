# Latag Web Platform Phase B2 (Auth, Portal, Admin, Licensing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD is mandatory for every `lib/` module (RED → verify fail → GREEN → verify pass).

**Goal:** The licensing backend and account surfaces: Supabase schema + RLS, email-OTP auth, `/account` portal (license status, feedback, deletion), `/admin` console (users, grants, pricing, flags, feedback inbox), a signed-receipt license API for the mobile app, and a payments **seam** with a manual-grant adapter (PayMongo/Xendit adapter arrives when the sandbox exists).

**Architecture (codebase-design vocabulary):**
- `lib/licensing.ts` is a **deep module**: two-function interface (`issueReceipt`, `verifyReceipt`) hiding HMAC construction, canonical payload encoding, and tamper rules. The interface is the test surface; mobile Phase C verifies the same receipt format offline.
- `lib/payments/` is a **seam**: `PaymentProvider` interface + `manual` adapter now; the PayMongo adapter later makes it two adapters (a real seam). Nothing outside the seam knows how money moves.
- `lib/supabase/*` are **adapters** around @supabase/ssr (browser / server / service-role). Route handlers and pages stay thin; complexity concentrates behind the adapters (deletion test: deleting a page must not delete logic).
- Migrations are repo files under `supabase/migrations/`, applied to the remote via the Management API (the MCP server is deliberately read-only).

**Tech Stack:** Next.js 16 App Router · @supabase/supabase-js + @supabase/ssr · Vitest (web lib tests) · Supabase Postgres with RLS · HMAC-SHA256 receipts (node:crypto)

## Global Constraints

- **Project facts:** Supabase project ref `dcnpuvtbftpbcjcvfnlt`; URL `https://dcnpuvtbftpbcjcvfnlt.supabase.co`; DB is empty (no tables/migrations). `SUPABASE_ACCESS_TOKEN` exists in the User environment (management API). The MCP server is read-only — never attempt `apply_migration` through it.
- **Secrets discipline:** `SUPABASE_SERVICE_ROLE_KEY` and `LICENSE_SIGNING_SECRET` live ONLY in `apps/web/.env.local` (gitignored) + Vercel env (user adds). Never in committed files, logs, or reports. `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public by design and may appear in `.env.example` values.
- **Money:** integer whole pesos (matches mobile). Single SKU `latag-pro-lifetime`, price read from `pricing` table.
- **Free-tier/product truth stays intact:** no purchase flow ships in B2 (manual grants only); public copy keeps "Purchases open soon". The B2 launch-day copy sweep (terms "is sold", privacy "web portal", pricing copy) flips only when a real provider adapter lands.
- **Privacy commitments are binding:** account deletion removes auth user + profile + feedback (licenses/payments rows keep only non-personal references per the retention clause). No inventory data exists server-side, ever.
- **Auth:** Supabase email OTP (6-digit code — mirrors the mobile design). Admin = email ∈ `ADMIN_EMAILS` (comma-separated env, server-only).
- **Design system:** all portal/admin UI uses the existing tokens/utilities (`bg-bg`, `surface1/2`, `hairline`, `ink*`, `acid`, `.display`, `.tnum`), existing `ui.tsx` components where they fit, one `h1` per page, ≥44px targets, focus-visible acid outlines. Dark-only.
- **Static pages stay static** (landing, legal, /pro). New authed routes are dynamic — that's expected; `pnpm web:build` must still exit 0.
- **Gates per task:** `pnpm -C apps/web exec tsc --noEmit` → 0; `pnpm web:build` → 0; `pnpm -C apps/web test` (vitest) → green. Mobile suite untouched (`pnpm -C apps/mobile test` → 32/32 at final gate). Commit per task. `.superpowers/` never committed.

**File structure (end state, new files only):**

```
supabase/migrations/0001_licensing.sql
apps/web/
  .env.local (gitignored)  .env.example
  vitest.config.ts
  scripts/apply-migration.mjs      management-API SQL runner
  scripts/fetch-service-key.mjs    writes .env.local (never prints secrets)
  lib/supabase/browser.ts  server.ts  admin.ts
  lib/licensing.ts         lib/admin-gate.ts
  lib/payments/types.ts    lib/payments/manual.ts
  middleware.ts
  app/account/sign-in/page.tsx     app/account/page.tsx
  app/account/actions.ts           (server actions: otp, verify, sign-out, feedback, delete)
  app/api/license/route.ts         app/api/webhooks/payments/route.ts
  app/admin/page.tsx  app/admin/actions.ts
  tests/licensing.test.ts  tests/payments.test.ts  tests/admin-gate.test.ts
```

---

### Task 1: Dependencies, env scaffolding, vitest

**Files:**
- Modify: `apps/web/package.json` (deps + `test` script)
- Create: `apps/web/vitest.config.ts`, `apps/web/.env.example`, `apps/web/scripts/fetch-service-key.mjs`, `apps/web/.env.local` (generated, NOT committed)

**Interfaces:**
- Produces: `pnpm -C apps/web test` runs vitest; `.env.local` contains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LICENSE_SIGNING_SECRET`, `ADMIN_EMAILS`; `.env.example` documents the same names with public values only.

- [ ] **Step 1:** Install: `pnpm -C apps/web add @supabase/supabase-js @supabase/ssr` and `pnpm -C apps/web add -D vitest`. Add script `"test": "vitest run"`.

- [ ] **Step 2:** `apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], environment: "node" } });
```

- [ ] **Step 3:** Confirm `apps/web/.gitignore` covers `.env*` (create-next-app default does). `apps/web/.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://dcnpuvtbftpbcjcvfnlt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjbnB1dnRiZnRwYmNqY3Zmbmx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMjYzNjEsImV4cCI6MjA5OTYwMjM2MX0.BoelJ4pLi0JuF8a6A3Ca0Iq_VrSmAV5adm9W8BHekOY
SUPABASE_SERVICE_ROLE_KEY=            # server-only; from scripts/fetch-service-key.mjs — never commit a value
LICENSE_SIGNING_SECRET=               # server-only; random 32+ bytes hex
ADMIN_EMAILS=rarochristian029@gmail.com      # comma-separated owner emails for /admin
```

- [ ] **Step 4:** `apps/web/scripts/fetch-service-key.mjs` — reads `SUPABASE_ACCESS_TOKEN` from the environment, calls `GET https://api.supabase.com/v1/projects/dcnpuvtbftpbcjcvfnlt/api-keys?reveal=true`, finds the `service_role` key, generates `LICENSE_SIGNING_SECRET` via `crypto.randomBytes(32).toString("hex")` (only if not already present), and writes/merges `apps/web/.env.local` with all five variables. It must print ONLY "wrote .env.local (N keys)" — never key material. Run it; verify `.env.local` exists and `git status` does not list it.

- [ ] **Step 5:** Smoke test `apps/web/tests/smoke.test.ts` (`expect(1+1).toBe(2)`), run `pnpm -C apps/web test` → 1 passing. Gates. Commit: `chore(web): supabase deps, env scaffolding, vitest`

---

### Task 2: Schema migration + RLS (applied to remote)

**Files:**
- Create: `supabase/migrations/0001_licensing.sql`, `apps/web/scripts/apply-migration.mjs`

**Interfaces:**
- Produces: remote DB has `profiles, licenses, payments, pricing, feedback, feature_flags` with RLS enabled, the `handle_new_user` trigger, and seeded pricing. Controller verifies via MCP `list_tables` after.

- [ ] **Step 1:** `supabase/migrations/0001_licensing.sql`:
```sql
-- Latag licensing schema (platform spec §5). All authored as repo migration; applied via management API.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  granted_at timestamptz not null default now(),
  payment_id uuid
);
create unique index licenses_one_active_per_sku on public.licenses(user_id, sku) where status = 'active';
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  provider_ref text,
  amount integer not null,
  currency text not null default 'PHP',
  status text not null check (status in ('pending','paid','failed','refunded')),
  created_at timestamptz not null default now()
);
create table public.pricing (
  sku text primary key,
  price integer not null,
  currency text not null default 'PHP',
  active boolean not null default true
);
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('feedback','suggestion','feature_request')),
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'new' check (status in ('new','reviewed','done')),
  created_at timestamptz not null default now()
);
create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  notes text
);

-- auto-create profile on signup
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: users read their own; public reads pricing/flags; ALL writes go through service role (bypasses RLS)
alter table public.profiles enable row level security;
alter table public.licenses enable row level security;
alter table public.payments enable row level security;
alter table public.pricing enable row level security;
alter table public.feedback enable row level security;
alter table public.feature_flags enable row level security;

create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "own licenses" on public.licenses for select using (auth.uid() = user_id);
create policy "own payments" on public.payments for select using (auth.uid() = user_id);
create policy "public pricing" on public.pricing for select using (active);
create policy "public flags" on public.feature_flags for select using (true);
create policy "own feedback read" on public.feedback for select using (auth.uid() = user_id);
create policy "own feedback insert" on public.feedback for insert with check (auth.uid() = user_id);

insert into public.pricing (sku, price, currency, active) values ('latag-pro-lifetime', 499, 'PHP', true);
```

- [ ] **Step 2:** `apps/web/scripts/apply-migration.mjs` — usage `node scripts/apply-migration.mjs ../../supabase/migrations/0001_licensing.sql`; reads the file, POSTs `{ "query": "<sql>" }` to `https://api.supabase.com/v1/projects/dcnpuvtbftpbcjcvfnlt/database/query` with `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`; prints HTTP status and the response body ONLY on error; exits non-zero on failure. Idempotence: do not re-run on success.

- [ ] **Step 3:** Run it. On success, report DONE_WITH the controller-verification note: the controller re-checks via MCP `list_tables` (6 tables) and a pricing select. Gates. Commit: `feat(db): licensing schema, RLS, signup trigger (migration 0001)`

---

### Task 3: `lib/licensing.ts` — signed receipts (strict TDD)

**Files:** Create `apps/web/lib/licensing.ts`, `apps/web/tests/licensing.test.ts`

**Interfaces:**
- Produces: `issueReceipt(input: { userId: string; sku: string; grantedAt: string }, secret: string): string` (format `latag1.<base64url payload>.<base64url hmac-sha256>`); `verifyReceipt(receipt: string, secret: string): { valid: true; userId: string; sku: string; grantedAt: string } | { valid: false }`. Pure node:crypto; no Supabase imports. Mobile Phase C re-implements `verifyReceipt` against the same format — the format IS the contract, pin it exactly.

- [ ] **Step 1 (RED):** `apps/web/tests/licensing.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { issueReceipt, verifyReceipt } from "../lib/licensing";

const SECRET = "test-secret";
const INPUT = { userId: "11111111-1111-1111-1111-111111111111", sku: "latag-pro-lifetime", grantedAt: "2026-07-14T00:00:00.000Z" };

describe("licensing receipts", () => {
  test("round-trips a valid receipt", () => {
    const r = issueReceipt(INPUT, SECRET);
    expect(r.startsWith("latag1.")).toBe(true);
    expect(verifyReceipt(r, SECRET)).toEqual({ valid: true, ...INPUT });
  });
  test("rejects tampered payload", () => {
    const r = issueReceipt(INPUT, SECRET);
    const [v, p, s] = r.split(".");
    const forged = Buffer.from(JSON.stringify({ ...INPUT, sku: "everything-free" })).toString("base64url");
    expect(verifyReceipt([v, forged, s].join("."), SECRET)).toEqual({ valid: false });
  });
  test("rejects wrong secret, wrong version, garbage", () => {
    const r = issueReceipt(INPUT, SECRET);
    expect(verifyReceipt(r, "other-secret")).toEqual({ valid: false });
    expect(verifyReceipt(r.replace("latag1.", "latag2."), SECRET)).toEqual({ valid: false });
    expect(verifyReceipt("not-a-receipt", SECRET)).toEqual({ valid: false });
    expect(verifyReceipt("", SECRET)).toEqual({ valid: false });
  });
});
```
Run → FAIL (module not found). Capture output.

- [ ] **Step 2 (GREEN):** `apps/web/lib/licensing.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const VERSION = "latag1";

export type ReceiptClaims = { userId: string; sku: string; grantedAt: string };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${VERSION}.${payload}`).digest("base64url");
}

/** Deep module: the receipt format (version.payload.signature) is the whole contract. */
export function issueReceipt(claims: ReceiptClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${VERSION}.${payload}.${sign(payload, secret)}`;
}

export function verifyReceipt(receipt: string, secret: string): ({ valid: true } & ReceiptClaims) | { valid: false } {
  const parts = receipt.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return { valid: false };
  const [, payload, sig] = parts;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false };
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.userId !== "string" || typeof claims.sku !== "string" || typeof claims.grantedAt !== "string") return { valid: false };
    return { valid: true, userId: claims.userId, sku: claims.sku, grantedAt: claims.grantedAt };
  } catch {
    return { valid: false };
  }
}
```
Run → PASS. Gates. Commit: `feat(web): licensing receipts — deep module, TDD`

---

### Task 4: Payments seam + admin gate (strict TDD)

**Files:** Create `apps/web/lib/payments/types.ts`, `apps/web/lib/payments/manual.ts`, `apps/web/lib/admin-gate.ts`, `apps/web/tests/payments.test.ts`, `apps/web/tests/admin-gate.test.ts`

**Interfaces:**
- `types.ts`: `type CheckoutRequest = { sku: string; amount: number; userId: string }` · `type CheckoutResult = { kind: "redirect"; url: string } | { kind: "unavailable"; reason: string }` · `type WebhookVerdict = { ok: true; userId: string; sku: string; amount: number; providerRef: string } | { ok: false; reason: string }` · `interface PaymentProvider { readonly name: string; createCheckout(req: CheckoutRequest): Promise<CheckoutResult>; verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookVerdict> }`.
- `manual.ts`: `manualProvider: PaymentProvider` — `createCheckout` → `{ kind: "unavailable", reason: "purchases-open-soon" }`; `verifyWebhook` → `{ ok: false, reason: "manual provider accepts no webhooks" }`. (Grants happen via admin action, not through the seam.)
- `admin-gate.ts`: `isAdminEmail(email: string | null | undefined, adminEmails: string | undefined): boolean` — case-insensitive, trims, comma-separated list, empty list ⇒ always false.

- [ ] **Step 1 (RED):** tests:
```ts
// tests/payments.test.ts
import { expect, test } from "vitest";
import { manualProvider } from "../lib/payments/manual";

test("manual provider never opens a checkout", async () => {
  const res = await manualProvider.createCheckout({ sku: "latag-pro-lifetime", amount: 499, userId: "u1" });
  expect(res).toEqual({ kind: "unavailable", reason: "purchases-open-soon" });
});
test("manual provider rejects all webhooks", async () => {
  const v = await manualProvider.verifyWebhook("{}", null);
  expect(v.ok).toBe(false);
});
```
```ts
// tests/admin-gate.test.ts
import { expect, test } from "vitest";
import { isAdminEmail } from "../lib/admin-gate";

test("matches case-insensitively with whitespace and multiple entries", () => {
  expect(isAdminEmail("Owner@Example.com", " owner@example.com , second@x.ph ")).toBe(true);
  expect(isAdminEmail("second@x.ph", "owner@example.com,second@x.ph")).toBe(true);
});
test("denies non-members, empty env, null email", () => {
  expect(isAdminEmail("evil@x.ph", "owner@example.com")).toBe(false);
  expect(isAdminEmail("owner@example.com", "")).toBe(false);
  expect(isAdminEmail("owner@example.com", undefined)).toBe(false);
  expect(isAdminEmail(null, "owner@example.com")).toBe(false);
});
```
Run → FAIL. **Step 2 (GREEN):** implement exactly the interfaces above (manual.ts ~12 lines; admin-gate ~6 lines: split, trim, lowercase, includes). Run → PASS. Gates. Commit: `feat(web): payment seam (manual adapter) + admin gate — TDD`

---

### Task 5: Supabase adapters, middleware, sign-in flow

**Files:**
- Create: `apps/web/lib/supabase/browser.ts`, `apps/web/lib/supabase/server.ts`, `apps/web/lib/supabase/admin.ts`, `apps/web/middleware.ts`, `apps/web/app/account/sign-in/page.tsx`, `apps/web/app/account/actions.ts`

**Interfaces:**
- `browser.ts`: `createBrowserSupabase()` via `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`.
- `server.ts`: `createServerSupabase()` via `createServerClient` + `cookies()` per current @supabase/ssr docs (getAll/setAll pattern).
- `admin.ts`: `createAdminSupabase()` service-role client (`auth: { persistSession: false }`); import "server-only".
- `middleware.ts`: standard @supabase/ssr session refresh; matcher limited to `["/account/:path*", "/admin/:path*", "/api/license"]`.
- `actions.ts` server actions: `requestOtp(email)` → `signInWithOtp({ email, options: { shouldCreateUser: true } })`; `verifyOtp(email, code)` → `verifyOtp({ email, token: code, type: "email" })` then redirect `/account`; `signOut()`; errors returned as `{ error: string }` for the form to render (danger text + toast-style card).
- Sign-in page (client component): email field → "Send code" → 6 large code boxes UI consistent with the design system (single hidden input driving 6 display cells is fine; keep it simple: one `inputMode="numeric"` field styled large-tracking is acceptable), verify button, resend link. Uses ui.tsx components; one h1 "Sign in".
- **Reconcile with current @supabase/ssr API via its README in node_modules — do not trust training data** (per apps/web/AGENTS.md).

- [ ] Steps: implement, then verification: gates + headless-browser smoke (`/account/sign-in` renders form; `/account` while signed out redirects to sign-in — implement that redirect in the account page itself via `createServerSupabase().auth.getUser()`). Commit: `feat(web): supabase adapters, middleware, email-otp sign-in`

---

### Task 6: `/account` portal + `/api/license` + webhook stub

**Files:**
- Create: `apps/web/app/account/page.tsx`, `apps/web/app/api/license/route.ts`, `apps/web/app/api/webhooks/payments/route.ts`
- Modify: `apps/web/app/account/actions.ts` (add `submitFeedback`, `deleteAccount`), `apps/web/app/layout.tsx` (header gains an "Account" text link to /account)

**Interfaces:**
- `/account` (server component): `getUser()`; unauthenticated → redirect sign-in. Shows: email + sign-out; **License card** — queries `licenses` (own, RLS): active `latag-pro-lifetime` ⇒ "PRO — Active since <date>" acid badge; else Free card with "Purchases open soon" + pricing from `pricing` table (`₱<price> one-time` tnum); **Feedback form** — type select (feedback/suggestion/feature_request) + textarea → `submitFeedback` inserts via server client (RLS-checked), success/error state inline; **Danger zone** — Delete account button with confirm step → `deleteAccount` server action: verify session, then `createAdminSupabase().auth.admin.deleteUser(user.id)` (cascades profile via FK; feedback user_id nulls), sign out, redirect home.
- `/api/license` GET: reads `Authorization: Bearer <supabase access token>` (mobile) OR falls back to cookie session (portal debugging). Validates via `createAdminSupabase().auth.getUser(jwt)`. Queries active license for `latag-pro-lifetime`; 404 `{ license: null }` if none; else `{ license: { sku, status, grantedAt }, receipt: issueReceipt({ userId, sku, grantedAt }, LICENSE_SIGNING_SECRET) }`. No caching (`dynamic = "force-dynamic"`).
- `/api/webhooks/payments` POST: reads raw body + `x-signature` header, routes through the seam (`manualProvider.verifyWebhook`) → always 501 `{ error: "purchases-open-soon" }` today. The handler shape is provider-agnostic; swapping the adapter later changes no handler code.

- [ ] Steps: implement; verification: gates + headless smoke (sign-in page 200; `/api/license` without auth → 401; webhook POST → 501); commit: `feat(web): account portal, license api, webhook seam stub`

---

### Task 7: `/admin` console

**Files:** Create `apps/web/app/admin/page.tsx`, `apps/web/app/admin/actions.ts`

**Interfaces:**
- Gate: server component gets user; `!isAdminEmail(user?.email, process.env.ADMIN_EMAILS)` → `notFound()` (admin is invisible, not advertised).
- Sections (single page, anchored, design-system styling):
  1. **Users** — `createAdminSupabase().auth.admin.listUsers()` (first 50): email, created, license badge (join via one `licenses` select). Per-row actions: **Grant Pro** / **Revoke** buttons → server actions `grantPro(userId)` (insert license row via admin client; idempotent via the partial unique index — on conflict do nothing) and `revokePro(userId)` (update status='revoked').
  2. **Pricing** — current `pricing` rows; inline number input + Save → `updatePrice(sku, price)` (admin client; integer pesos, reject <1).
  3. **Feedback inbox** — all feedback newest-first with type/status chips; per-row status cycle new→reviewed→done via `setFeedbackStatus(id, status)`.
  4. **Feature flags** — list + toggle → `setFlag(key, enabled)`; small "add flag" input (key + notes).
- All actions: verify admin INSIDE each server action (never trust the page gate alone), return `{ error }` on failure, `revalidatePath("/admin")` on success.

- [ ] Steps: implement; verification: gates + headless smoke (admin as anonymous → 404). Manual QA note: owner signs in with the ADMIN_EMAILS address and grants themselves Pro to exercise the loop. Commit: `feat(web): admin console — users, grants, pricing, feedback, flags`

---

### Task 8: Final gate + deploy notes

- [ ] Full suite: `pnpm -C apps/web test` (all vitest green) · web tsc 0 · `pnpm web:build` 0 (landing/legal/pro still static; account/admin/api dynamic) · `pnpm -C apps/mobile test` 32/32.
- [ ] Headless end-to-end smoke against a local `next start`: unauth redirects, 401s, 404 admin, sign-in renders. (True OTP login e2e is manual — email delivery.)
- [ ] Create `docs/qa/web-b2-checklist.md`: owner walkthrough — sign in with OTP (check Supabase auth logs if mail delayed), see Free card, grant self Pro in /admin, see PRO card, `GET /api/license` with the session token returns a receipt that `verifyReceipt` accepts, feedback round-trip appears in /admin inbox, delete a test account.
- [ ] Update `docs/superpowers/specs/2026-07-13-latag-platform-monetization-design.md` phase table: B2 shipped (manual grants), payments adapter pending provider.
- [ ] **Vercel env (user action, listed in report):** add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LICENSE_SIGNING_SECRET`, `ADMIN_EMAILS` to the Vercel project (Production), then redeploy.
- [ ] Commit: `chore(web): B2 QA checklist + spec phase update — B2 complete`

## Self-Review (performed)

- **Spec coverage:** platform spec §4.2 portal ✓ (T6), §4.3 admin ✓ (T7 — telemetry viz deferred with telemetry itself to Phase C/D), §4.5 APIs ✓ (T6: license + webhook; telemetry endpoint ships with Phase C mobile sync), §5 schema ✓ (T2, incl. RLS beyond spec — required by Supabase best practice), monetization §2 licensing flow ✓ (grant → receipt → mobile cache contract pinned in T3).
- **Placeholder scan:** none; the payments adapter is explicitly the seam's second-adapter future, not a TBD.
- **Type consistency:** `issueReceipt(claims, secret)` signature identical in T3 tests/impl and T6 route usage; `PaymentProvider` names match T4↔T6; `isAdminEmail(email, adminEmails)` matches T4↔T7.
- **Secrets:** only `.env.local` (gitignored) + Vercel; fetch script never prints values; reports instructed likewise.
