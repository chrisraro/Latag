# Latag Codebase Audit

Latag Codebase Audit (Honest Roast)

Product: offline-first ukay ops tool (Expo mobile + Next web + Supabase).
Shape: ~200 TS/SQL files, phase-driven monorepo, strong product docs.
Verdict: unusually thoughtful for a solo build — and also carrying real product, architecture, and ops debt that will bite if you scale users or open payments.

───

1. Entire codebase

What is actually good

┌──────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Strength                     │ Why it matters                                                                                                      │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Product clarity              │ PRODUCT.md + specs know the user (warehouse, one hand, no signal). Most codebases never get this.                   │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Offline-first is real        │ Inventory/sessions/photos live in SQLite. Cloud is a projection, not the source of truth.                           │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Privacy boundary is          │ Cost/profit/location never exist on shop_items. Explicit field mapping, not ...item. That is rare and correct.      │
│ deliberate                   │                                                                                                                     │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Security literacy            │ RLS, column grants after a real leak, SECURITY DEFINER hardening, admin re-check on actions, server-only on admin   │
│                              │ client.                                                                                                             │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Test density (mobile)        │ ~51 mobile tests covering repo, sync, math, screens. Not theater.                                                   │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Written decisions            │ Specs/plans explain why (OTA crash, column grants, outbox). Future-you can reason.                                  │
└──────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Whole-repo roast

1. This is a monorepo cosplay

latag/
  apps/mobile   ← real product
  apps/web      ← marketing + admin + storefront + license API
  supabase/     ← platform DB
  docs/         ← almost a third app

There is no packages/, no shared domain, no workspace libraries. Catalog is re-declared on the landing page ("mirrors mobile"). License HMAC lives on web; mobile stores a string and flips pro=true. Root scripts:

"test": "pnpm -C apps/mobile test",
"typecheck": "pnpm -C apps/mobile exec tsc --noEmit"

Web is second-class. You have two apps in one repo, not a platform.

2. No CI, no formatting gate, no shared lint

No .github, no turbo, no eslint/prettier at root. Quality depends on "I remember to run tests." That works for one owner. It does not survive a second contributor or a bad Friday merge.

3. Docs are a superpower and a trap

docs/superpowers/ is excellent. It is also a parallel product. Specs drift (MVP said tops-only + 20 free logs; code is full catalog + unlimited local logs). Without a "current truth" doc that is checked against code, the paper trail becomes mythology.

4. Two databases, three identities of "truth"

┌─────────────────────────────┬─────────────────────────────────────────────┐
│ Layer                       │ Role                                        │
├─────────────────────────────┼─────────────────────────────────────────────┤
│ Device SQLite               │ Real inventory, costs, photos, entitlements │
├─────────────────────────────┼─────────────────────────────────────────────┤
│ Supabase shops / shop_items │ Public projection                           │
├─────────────────────────────┼─────────────────────────────────────────────┤
│ Local entitlements.pro      │ Monetization gate                           │
└─────────────────────────────┴─────────────────────────────────────────────┘

That split is right for offline-first. The failure modes are classic:

• publish queue stuck at 5 attempts with weak recovery UX
• photoSync wrong → re-uploads or stale public photos
• Pro on device forever after a revoke until something hits /api/license
• no multi-device: second phone is a different business

5. Monetization is soft clay

• Free log limit: dead code path. addItem reports remaining logs, does not enforce. consumeLog still exists. Specs and code disagree.
• Pro: local boolean. Anyone who can write SQLite can be Pro. Fine for indie trust model; not a "license system."
• Receipt: server signs HMAC; mobile never verifies — only trusts HTTP JSON and stores opaque string.
• Payments: manualProvider always 501. Checkout is vapor.
• Lifetime Pro at ₱499 with no revoke-on-device story is a product promise you cannot fully enforce.

6. Phase G is half a product

Native floating bar / Compose / OTA almost bricked a device (documented). Native UI is gated pending a real native build. You shipped modern-shell ambition on a binary that cannot safely run it. That is honest engineering — and also a sign the surface area is racing ahead of release process.

7. Type safety is performative in the hottest path

type AnyDb = any all over repo, entitlements, license, shop-sync. Drizzle is strong; you threw it away at the boundary that matters most. ~90 any / ignore-style hits across apps, concentrated in data code.

8. God modules

┌──────────────┬─────────┬─────────────────────────────────────────┐
│ File         │ ~LOC    │ Smell                                   │
├──────────────┼─────────┼─────────────────────────────────────────┤
│ shop-api.ts  │ 430     │ network + storage + profile + errors    │
├──────────────┼─────────┼─────────────────────────────────────────┤
│ repo.ts      │ 364     │ entire local write model                │
├──────────────┼─────────┼─────────────────────────────────────────┤
│ shop-sync.ts │ 260     │ outbox machine + photo marker + payload │
├──────────────┼─────────┼─────────────────────────────────────────┤
│ tab screens  │ 260–360 │ query + UI + side effects               │
└──────────────┴─────────┴─────────────────────────────────────────┘

Not unreadable — comments are good — but this is "one person who remembers everything" structure.

───

Whole-codebase scorecard

┌───────────────────────────────┬───────────────────┬────────────────────────────────────────────────┐
│ Area                          │ Grade             │ Note                                           │
├───────────────────────────────┼───────────────────┼────────────────────────────────────────────────┤
│ Product sense                 │ A                 │ Rare clarity                                   │
├───────────────────────────────┼───────────────────┼────────────────────────────────────────────────┤
│ Architecture intent           │ A−                │ Offline + privacy done right                   │
├───────────────────────────────┼───────────────────┼────────────────────────────────────────────────┤
│ Monorepo hygiene              │ D                 │ No shared packages, uneven tooling             │
├───────────────────────────────┼───────────────────┼────────────────────────────────────────────────┤
│ Security mindset              │ B+                │ Real RLS work; client Pro is soft              │
├───────────────────────────────┼───────────────────┼────────────────────────────────────────────────┤
│ Ops / CI                      │ F                 │ No pipeline, migration apply is tribal         │
├───────────────────────────────┼───────────────────┼────────────────────────────────────────────────┤
│ Consistency (spec↔code)       │ C                 │ Free tier, MVP scope, catalog drift            │
├───────────────────────────────┼───────────────────┼────────────────────────────────────────────────┤
│ Test culture                  │ B+ mobile / C web │ Uneven                                         │
├───────────────────────────────┼───────────────────┼────────────────────────────────────────────────┤
│ Ship readiness for paid users │ C−                │ Payments stub, soft license, multi-device none │
└───────────────────────────────┴───────────────────┴────────────────────────────────────────────────┘

Overall roast line:
This is not a sloppy vibe-coded junk pile. It is a disciplined solo system with production-shaped edges and startup-shaped holes. The docs are better than the platform packaging. The privacy model is better than the monetization model. The mobile app is the company; everything else is scaffolding that sometimes pretends to be infrastructure.

───

2. Backend structure audit

"Backend" here is really three things:

1. Supabase Postgres (supabase/migrations) — platform data
2. Next.js route handlers + server actions — license, admin, webhooks, account
3. Mobile as writer — authenticated client writes shops/items/storage directly (no BFF for storefront writes)

Architecture (as built)


                           SQLite local truth   ╭─────────────╮
                          ┌────────────────────▶│ expo-sqlite │
┌──────────┐              │                     ╰─────────────╯
│ Expo app ├──────────────┤
└──────────┘              │Bearer GET license   ┌───────────────────┐
                          ├────────────────────▶│ Next /api/license │
┌─────────────────┐       │                     └───────────────────┘
│ Next storefront ├───────┤
└─────────────────┘       │auth + shop writes   ╭──────────╮
                          ├────────────────────▶│ Supabase │
┌───────────────┐         │                     ╰──────────╯
│ Admin actions ├─────────┘
└───────────────┘


┌────────────────────────┐ stub 501             ┌────────────────┐
│ /api/webhooks/payments ├─────────────────────▶│ manualProvider │
└────────────────────────┘                      └────────────────┘

What is strong

Schema discipline on the public surface

• shop_items has no cost columns — absence is the control
• RLS default-deny + owner policies
• Migration 0005: column grants after user_id leak — then 0006/0007 repair visibility via definer functions
• That sequence is the opposite of careless; you fixed a real production break and wrote it down

License API is careful

• Bearer or cookie
• Admin client scoped by verified user id
• No secret leakage in errors
• HMAC receipt format with timing-safe verify (on server)

Admin is not a costume gate

• Page returns 404 for non-admins (does not advertise the route)
• Every mutation re-runs requireAdmin()
• UUID validation, user-facing error scrubbing

Payment seam exists

• PaymentProvider interface is the right abstraction even if only a stub implements it

Backend roast

1. There is almost no application backend

Storefront writes go phone → PostgREST → Postgres. That is fine for v1 volume. It means:

• no server-side validation of price/specs beyond DB checks
• no rate limits on publish
• no audit log of who published what when (beyond row timestamps)
• business rules live in mobile TypeScript that buyers never hit

If someone reverse-engineers the schema, they still need auth — but your "API" is the database.

2. Migrations are repo-truth with live-truth footnotes

platform-objects.md documents objects not created by migrations. Comments like "APPLY: not applied by this commit" appear in SQL. That is honest and also terrifying: schema drift is a process, not a pipeline. No supabase config in-repo for local stack was obvious from the tree; apply path is "management API / tribal knowledge."

3. Licensing is a cache, not a control plane

┌────────────────────────────────────────────────┬────────────────────────────────────────────────────┐
│ Claim                                          │ Reality                                            │
├────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
│ Signed receipt                                 │ Issued yes, verified on device no                  │
├────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
│ Offline Pro forever                            │ Product feature and abuse vector                   │
├────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
│ Free tier 20 logs                              │ Code path abandoned                                │
├────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
│ Revoke                                         │ DB status flips; device may stay Pro until refresh │
├────────────────────────────────────────────────┼────────────────────────────────────────────────────┤
│ Hardcoded https://latag.vercel.app/api/license │ Env/deploy coupling baked into mobile              │
└────────────────────────────────────────────────┴────────────────────────────────────────────────────┘

applyLicense is literally: set pro=true, store string. The golden-vector comment says mobile would re-implement verify — it never did.

4. Payments are a ghost town with street signs

// always rejects → 501
manualProvider.verifyWebhook(...)

Tables exist (payments, pricing). Webhook exists. Checkout does not. Admin can grant Pro by hand. That is a manual SaaS, not a payments backend. Fine for early access; do not market "buy Pro" as automated.

5. Admin will not scale past you

• listUsers({ perPage: 50 }) — hard ceiling
• Email allowlist in env — no roles table
• No pagination, search, audit trail, or 2FA story
• Service role used liberally (correct for admin, high blast radius if env leaks)

6. RLS history shows the danger of "DB as API"

0003 public policies → 0005 column grants → storefront empty → 0006 definer visibility → 0007 owner fn. That is mature incident handling. It also proves: every grant/policy change can break the product in ways TypeScript cannot catch. You need policy tests against a real Postgres (or at least SQL fixtures), not only vitest of pure helpers.

7. Types are hand-maintained

apps/web/lib/supabase/types.ts — if generated, good; if hand-synced, it will lie. No evidence of automated supabase gen types in root scripts.

8. Dual write path complexity

Outbox (publish_queue) + photo folder ownership + photoSync marker + delete-on-unpublish is a mini distributed system inside one phone. Backend is thin; the hard backend is the drain state machine. That is clever. It is also where support tickets will live ("my shop didn't update").

───

Backend scorecard

┌──────────────────────────┬───────┬────────────────────────────────────────────────────────┐
│ Area                     │ Grade │ Note                                                   │
├──────────────────────────┼───────┼────────────────────────────────────────────────────────┤
│ Data model (public shop) │ A     │ Privacy by schema                                      │
├──────────────────────────┼───────┼────────────────────────────────────────────────────────┤
│ RLS / grants             │ B+    │ Fixed under fire; still fragile without tests          │
├──────────────────────────┼───────┼────────────────────────────────────────────────────────┤
│ Auth (Supabase)          │ B     │ Standard; mobile session + deep links                  │
├──────────────────────────┼───────┼────────────────────────────────────────────────────────┤
│ License service          │ C+    │ Correct server issue; weak client trust model          │
├──────────────────────────┼───────┼────────────────────────────────────────────────────────┤
│ Payments                 │ D     │ Scaffold only                                          │
├──────────────────────────┼───────┼────────────────────────────────────────────────────────┤
│ Admin                    │ B−    │ Safe enough for one operator; not multi-admin          │
├──────────────────────────┼───────┼────────────────────────────────────────────────────────┤
│ API layer                │ C     │ Almost none; DB is the API                             │
├──────────────────────────┼───────┼────────────────────────────────────────────────────────┤
│ Operability              │ D     │ Manual migrations, no CI, env tribalism                │
├──────────────────────────┼───────┼────────────────────────────────────────────────────────┤
│ Multi-device / backup    │ F     │ Not a backend concern yet — and that is a product hole │
└──────────────────────────┴───────┴────────────────────────────────────────────────────────┘

Backend roast line:
You built a security-conscious projection database and a tiny license desk, then put the real write path in the phone. That matches offline-first. It does not match "platform backend." When money is real, you will need a real grant path (webhook → license row → optional device revalidation), policy tests, and something stronger than a SQLite boolean.

───

3. Frontend audit

Two frontends: Expo mobile (the product) and Next web (marketing + storefront + admin + account).

───

3A. Mobile frontend

Strengths

• Clear IA: Home snapshot, Inventory, Batches, Shop, Settings — money-forward
• useLiveQuery as state manager: no Redux spaghetti
• UI kit + theme tokens (FONT, COLORS, OLED black)
• Haptics, toasts, reduced-motion, a11y labels on stats
• Rapid console / wheels / chips match "zero typing"
• Outbox kick on launch/foreground — publishing does not block logging
• Tests include screen-level suites (home, inventory, shop, sessions)

Mobile roast

1. Screens are mini-apps

Home ~361, shop ~346, setup ~305, batches ~296, add item ~296, item detail ~282. Each imports db + repo + shop + media + haptics + navigation. No clear "view model" layer. Logic is tested in lib/; screens still own too much orchestration.

2. Dual styling systems

NativeWind classNames and inline style={{ fontFamily: FONT.bold }} everywhere. Tokens fight utility classes. Theme is real; consistency cost is high.

3. Entitlements UX vs code

Settings copy: unlimited local inventory, Pro unlocks shop. Good. Dead free-log machinery still in entitlements.ts confuses the next feature. Either delete it or enforce it — half-dead monetization is worse than none.

4. Item schema as UI tax

Thirteen nullable measurement columns + department-driven nulling is correct for SQLite simplicity and painful for forms, edit, and migration forever. Catalog-driven specColumnValues helps; the table is still a garment kitchen sink.

5. Native layer is a landmine

Gated native UI after OTA crash is rational. Shipping "modern shell" while half the chrome is JS fallback means design intent and device reality diverge. Users feel that as inconsistency, not as careful engineering.

6. Hardcoded production license URL

Mobile cannot point at preview/staging without a code change. Classic "works on my prod" coupling.

7. Empty states and error states vary by screen

Sync failures, auth halt, gave-up queue rows — some surface on Shop, some silent. Offline-first UIs need a single "system health" pattern; right now it is per-feature.

8. No shared design package with web

Same brand (Archivo, acid, warehouse console) reimplemented. Drift is inevitable (and already present in marketing department copy vs mobile catalog).

───

Mobile scorecard

┌───────────────────────────────┬────────────────────────────┐
│ Area                          │ Grade                      │
├───────────────────────────────┼────────────────────────────┤
│ Product UX fit                │ A−                         │
├───────────────────────────────┼────────────────────────────┤
│ Architecture (local-first)    │ A−                         │
├───────────────────────────────┼────────────────────────────┤
│ Screen structure              │ C+                         │
├───────────────────────────────┼────────────────────────────┤
│ Design system consistency     │ B−                         │
├───────────────────────────────┼────────────────────────────┤
│ Accessibility / one-hand      │ B+ (intent strong)         │
├───────────────────────────────┼────────────────────────────┤
│ Test coverage                 │ B+                         │
├───────────────────────────────┼────────────────────────────┤
│ Release / native / OTA safety │ C                          │
├───────────────────────────────┼────────────────────────────┤
│ Monetization UX honesty       │ B (copy) / D (enforcement) │
└───────────────────────────────┴────────────────────────────┘

Mobile roast line:
The best part of the company is this app. It is also becoming a ball of feature screens around a solid lib/ core. Extract view-models or hooks per flow before Phase H, or Home/Shop will become unmergeable.

───

3B. Web frontend

Strengths

• Storefront read path is smart: anon client, no cookies, ISR-friendly, React cache, explicit columns
• Shop pages stay relatively thin; formatting in shop-format
• Landing page has a real voice (ukay, not generic SaaS)
• Admin UI is boring tables — correct for an operator console
• Account/delete/feedback exist (compliance-minded for a small product)
• server-only boundaries respected

Web roast

1. Web is four products duct-taped

1. Marketing site
2. Public storefront
3. License API
4. Admin console

One Next app is fine at this size; folder structure does not express bounded contexts. lib/ is a grab bag.

2. Test poverty

~7 web tests vs ~51 mobile. The dangerous code (admin actions, license route, shop queries, webhooks) is under-tested relative to risk. Pure licensing helpers are tested; route integration is thin.

3. Marketing duplicates domain

DEPARTMENTS hard-coded on page.tsx. When mobile catalog changes, the website lies. Same brand fonts copied into assets/.

4. Showcase / landing weight

page.tsx ~282, Showcase ~281 — fine for marketing, but it is the heaviest web surface while the money path (checkout) does not exist. Effort skew: brand over commerce.

5. Admin UX is founder-only

No search, 50 users, no license history timeline, no payment linkage UI. When you have 200 sellers this page becomes a liability.

6. Storefront is the real web product — keep it sacred

Privacy, OG images, sitemap, inquiry deep-links: this is excellent product engineering. Do not let marketing refactors thrash it. Consider a clearer split ((marketing) vs (shop) route groups) if the app grows.

7. Next 16 + React 19

Modern stack is good; root does not typecheck/test web on pnpm test. Regressions ship unnoticed.

───

Web scorecard

┌────────────────────────────────┬────────────────────────────┐
│ Area                           │ Grade                      │
├────────────────────────────────┼────────────────────────────┤
│ Storefront correctness/privacy │ A−                         │
├────────────────────────────────┼────────────────────────────┤
│ Marketing craft                │ B+                         │
├────────────────────────────────┼────────────────────────────┤
│ Admin                          │ B− (safe) / C (scale)      │
├────────────────────────────────┼────────────────────────────┤
│ API routes                     │ B (license) / D (payments) │
├────────────────────────────────┼────────────────────────────┤
│ Shared design with mobile      │ C                          │
├────────────────────────────────┼────────────────────────────┤
│ Tests                          │ C−                         │
├────────────────────────────────┼────────────────────────────┤
│ Structure / modularity         │ C+                         │
└────────────────────────────────┴────────────────────────────┘

Web roast line:
The storefront is a sharp knife. The rest of the web app is a founder control panel wearing a landing page. That is appropriate for now — just do not confuse it with a multi-tenant SaaS frontend.

───

Priority fixes (if you only do five things)

1. Kill or enforce free-tier code — delete consumeLog / FREE_LOG_LIMIT or wire them; stop lying to the next reader.
2. Verify receipts on device (or stop issuing HMAC theater) — one shared verify implementation or drop the signature.
3. Add CI — mobile test + web test + both tsc on every push. Non-negotiable.
4. Policy/regression tests for shop RLS — you already burned production once on grants.
5. Extract packages/catalog + packages/licensing — stop dual-writing domain truth across apps.

Honorable next: env-based license URL, admin user search, real payment provider when ready, multi-device backup story (even "export encrypted dump").

───

Final verdict

┌─────────────────┬───────────────────────────────────────────────────────────────────┐
│ Layer           │ One-line                                                          │
├─────────────────┼───────────────────────────────────────────────────────────────────┤
│ Codebase        │ Serious solo craft, weak platform packaging                       │
├─────────────────┼───────────────────────────────────────────────────────────────────┤
│ Backend         │ Strong public-data security, thin app server, soft money controls │
├─────────────────┼───────────────────────────────────────────────────────────────────┤
│ Frontend mobile │ Real product, fat screens, best asset you have                    │
├─────────────────┼───────────────────────────────────────────────────────────────────┤
│ Frontend web    │ Storefront excellent; marketing/admin/API sharing one house       │
└─────────────────┴───────────────────────────────────────────────────────────────────┘

You are not shipping garbage. You are shipping a coherent offline product with a bolt-on cloud projection and a hand-operated Pro switch. The roast is not "rewrite everything." It is: stop expanding surface area until packaging, CI, monetization honesty, and shared domain catch up to the quality of your privacy model and specs.

───

4. Deep Dive — Payment & Monetization Architecture (2026-07-29)

This section is a ground-truth audit of the payment/monetization system end-to-end, conducted ahead of a planned RevenueCat migration. Every file, schema, and code path is documented as built — not as designed.

───

4A. Architecture Overview (as-built)

                    MOBILE                                WEB / SUPABASE
                    ──────                                ──────────────

  SQLite entitlements table          ──GET /api/license──>  licenses table (Supabase)
  {pro: bool, licenseReceipt,        <──200 + receipt────  issueReceipt() → HMAC latag1.
   logsUsed: int}                                           Admin: Grant/Revoke buttons

  Settings screen:                    ── authorization ──>  supabase.auth.getUser()
  • "Refresh license" button           Bearer access_token   → user_id → licenses query
  • PRO badge / Free label
  • Sign out (keeps cached Pro)       ── sign-out ──────>  supabase.auth.signOut()

  GoProSheet (components/)             ── links out ───>  latag.vercel.app/pro
  "Unlock on the website"                                   Pricing page (no checkout)

  No IAP code.                         POST /api/webhooks/payments
  No checkout redirect.                manualProvider → always 501
  No receipt verification on device.

Payment flow TODAY:
  Admin clicks "Grant Pro" on latag.vercel.app/admin
    → admin.actions.ts grantPro()
    → INSERT into licenses (user_id, sku='latag-pro-lifetime', status='active')
    → Mobile user opens Settings, taps "Refresh license"
    → fetchLicense() → GET /api/license → 200 {license, receipt}
    → applyLicense(db, {receipt}) → entitlements.pro = true

There is no automated payment path. Pro is granted by hand.

───

4B. File-by-File Inventory

MOBILE LAYER

┌────────────────────────────────────┬────────────┬──────────────────────────────────────────────────────┐
│ File                              │ Role       │ Notes                                               │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/mobile/db/schema.ts          │ Schema     │ entitlements table: id(1), pro(bool), licenseReceipt, │
│                                   │            │ logsUsed. Single-row pattern.                        │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/mobile/lib/entitlements.ts    │ Logic      │ ensureEntitlements (idempotent INSERT), logsRemaining,│
│                                   │            │ readLogsRemaining, consumeLog. FREE_LOG_LIMIT=20     │
│                                   │            │ is defined but NEVER enforced — dead code.            │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/mobile/lib/license.ts         │ License    │ fetchLicense (GET to LICENSE_URL hardcoded),         │
│                                   │            │ applyLicense (sets pro=true), clearLicense.          │
│                                   │            │ LICENSE_URL = "https://latag.vercel.app/api/license"  │
│                                   │            │ — not configurable per env.                          │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/mobile/lib/auth-complete.ts   │ Flow       │ completeSignIn: fetches license after auth, toasts    │
│                                   │            │ result. Shared by OTP + deep-link paths.             │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/mobile/app/(tabs)/settings.tsx│ UI         │ Settings screen: PRO/Free status, refresh, sign-out. │
│                                   │            │ ensureEntitlements called in effect (not render).     │
└────────────────────────────────────┴────────────┴──────────────────────────────────────────────────────┘

WEB / SUPABASE LAYER

┌────────────────────────────────────┬────────────┬──────────────────────────────────────────────────────┐
│ File                              │ Role       │ Notes                                               │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/web/app/api/license/route.ts  │ Route      │ GET → auth (bearer or cookie) → lookup licenses →   │
│                                   │            │ issueReceipt(). Returns 404 if no active license.    │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/web/lib/licensing.ts          │ Crypto     │ issueReceipt / verifyReceipt — HMAC-SHA256 in        │
│                                   │            │ latag1.{b64url_payload}.{b64url_sig} format.         │
│                                   │            │ verifyReceipt has timingSafeEqual — correct.          │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/web/lib/payments/types.ts     │ Interface  │ PaymentProvider interface: createCheckout(),          │
│                                   │            │ verifyWebhook(). Clean abstraction.                   │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/web/lib/payments/manual.ts    │ Stub       │ manualProvider — always returns "unavailable".        │
│                                   │            │ This is the active provider. No other exists.         │
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/web/app/api/webhooks/payments/│ Stub route │ POST → manualProvider.verifyWebhook() → 501.         │
│   route.ts                        │            │ Comment says "swapping manualProvider changes no code"│
├────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ apps/web/tests/payments.test.ts    │ Tests      │ 2 tests: manual never opens, never verifies.         │
└────────────────────────────────────┴────────────┴──────────────────────────────────────────────────────┘

SUPABASE SCHEMA

Table: licenses
  id uuid PK, user_id (FK→auth.users), sku text, status text (active|revoked),
  granted_at timestamptz, payment_id uuid (nullable FK→payments)
  UNIQUE INDEX: (user_id, sku) WHERE status = 'active'

Table: payments
  id uuid PK, user_id (FK→auth.users, nullable on delete set null),
  provider text, provider_ref text, amount int, currency text default 'PHP',
  status text (pending|paid|failed|refunded), created_at timestamptz

Table: pricing
  sku text PK, price int, currency text default 'PHP', active bool default true
  Seeded: latag-pro-lifetime · ₱499 · PHP · true

Table: profiles (id=uid, email, created_at) — auto-created on signup via trigger

RLS: users read own licenses/payments/profiles; public reads pricing; all via service role for admin

ADMIN CONTROLS

┌────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
│ File                              │ What it does                                                │
├────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ apps/web/app/admin/actions.ts      │ grantPro(), revokePro(), updatePrice(), setFeedbackStatus(), │
│                                   │ setFlag(), addFlag() — all re-check requireAdmin()           │
├────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ apps/web/app/admin/GrantRevokeForm │ Client component: Grant/Revoke button per user row           │
│  .tsx                             │                                                              │
├────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ apps/web/app/admin/PriceRow.tsx    │ Inline price editor                                         │
├────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ apps/web/app/admin/page.tsx        │ Server component: 404 non-admins, render user table + forms  │
└────────────────────────────────────┴──────────────────────────────────────────────────────────────┘

BOUNDARIES / HOT PATHS

• Mobile receipt invariant: verifyReceipt exists on web but mobile NEVER calls it. The receipt is cached as an opaque string.
  The Phase C plan explicitly documents this as deliberate: HMAC verification would require shipping the secret.
• Free-tier: consumeLog exists, FREE_LOG_LIMIT=20 exists, but nothing in the item creation path calls consumeLog.
  Spec says "20 lifetime logs" but code does not enforce it. Dead code.
• Revoke propagation: admin revokes → DB row flips to 'revoked' → mobile stays Pro until user manually taps "Refresh license".
  No push, no polling, no webhook to device.
• Hardcoded LICENSE_URL: "https://latag.vercel.app/api/license" is a string literal in apps/mobile/lib/license.ts.
  Cannot point at preview/staging without a code change.

───

4C. RevenueCat Migration Analysis

Your stated goal: "change the payment gateway to RevenueCat for prelaunch."

What RevenueCat is:
  RevenueCat is a cross-platform subscription & IAP management layer. It wraps StoreKit (iOS) and
  Google Play Billing (Android), handles receipt validation, and fires webhooks when entitlements change.
  It also has a web SDK (PurchasesJS) for Stripe-based web payments, but its core competency is
  mobile IAP through the app stores.

The current architecture is designed around:
  • Web-based checkout (avoid 15-30% store commission)
  • HMAC license receipts issued by the web backend
  • Mobile fetches license via HTTP — no IAP code
  • Explicit design decision §7: "No native in-app purchases, ever, unless store policy forces it"

This means switching to RevenueCat is not a drop-in replacement. It is an architectural pivot.

───

  Option A: RevenueCat for Mobile IAP (full store-based purchases)

  What changes:
    Mobile:
      • Add react-native-purchases (RevenueCat's RN SDK)
      • Replace fetchLicense() with Purchases.getCustomerInfo()
      • Replace GoProSheet link with Purchases.purchaseProduct() or paywall
      • Remove manual applyLicense / clearLicense — RC SDK caches entitlements
      • Add Purchases.configure() on app start
      • Define products/entitlements in App Store Connect + Google Play Console + RC dashboard

    Web (receipt validation):
      • Replace manualProvider with a RevenueCat adapter
      • Webhook from RC → verify → grant license in Supabase
      • Existing GET /api/license stays as secondary validation path

    What stays: licenses table, GET /api/license, admin UI, PaymentProvider interface

    Benefits: RC handles receipts, offline caching via SDK, refunds, billing, single dashboard.
    Downsides: 15-30% store commission, App Store review for price changes, +500KB binary,
               breaks "no IAP" design decision.

───

  Option B: RevenueCat for Web Payments Only (Stripe via RC)

  What changes:
    Web: Add PurchasesJS SDK to /pro page for Stripe checkout
    Web: RC webhook replaces manualProvider
    Mobile: Add react-native-purchases SDK for getCustomerInfo() only (no purchase in app)
    Mobile: Entitlements read from RC SDK cache instead of HTTP /api/license
    Keep: Supabase licenses table, admin UI, GET /api/license (secondary)

    Benefits: No store commission (Stripe ~2.9%), unified entitlement management,
              offline caching via SDK, no App Store review for price changes.
    Downsides: Stripe only on web (no GCash/Maya natively — PH buyers need cards),
              RC web SDK less mature than mobile SDKs.

───

  Option C: RevenueCat for Full Hybrid (Mobile IAP + Web Stripe)

  Unified entitlements across iOS (StoreKit), Android (Google Play), and web (Stripe via RC).
  Most flexibility, highest cost (store commissions + Stripe fees).
  Users buy however they want, entitlement syncs everywhere.

───

4D. Recommended Path

Given your PH market (GCash/Maya dominant, not credit cards) and the explicit no-IAP
design commitment, the cleanest prelaunch path is:

  1. Skip RevenueCat for now. Integrate PayMongo or Xendit (both native PH processors
     with GCash, Maya, card, GrabPay support) directly on the web checkout page.
  2. The existing architecture handles entitlement perfectly: web checkout → webhook →
     Supabase licenses table → mobile fetches via /api/license.
  3. Keep the PaymentProvider interface — swap the manual stub for a PayMongo/Xendit adapter.
  4. If mobile IAP becomes a requirement later, add RevenueCat then. The PaymentProvider
     interface means you can add an RC adapter alongside the PH processor.

  If you really want RevenueCat:
    → Option B is the safest prelaunch path — web-only Stripe checkout through RC,
      RC SDK for mobile entitlement caching. This avoids store commissions while
      giving you RevenueCat's entitlement management. The tradeoff is GCash/Maya
      support depends on Stripe's PH coverage (Stripe supports GCash via
      Stripe Payment Elements in the Philippines as of 2025).

───

4E. Audit Update — Payment/Monetization Scorecard (Revised)

┌───────────────────────────────────────┬────────┬──────────────────────────────────────────────────────────────┐
│ Area                                 │ Grade  │ Note                                                         │
├───────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────┤
│ PaymentProvider abstraction          │ A      │ Clean interface, ready for adapter swap                      │
├───────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────┤
│ License API (server side)            │ B+     │ Correct HMAC, timing-safe verify, scope isolation             │
├───────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────┤
│ License receipt caching (mobile)     │ B+     │ Offline-forever works; docs acknowledge crypto gap            │
├───────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────┤
│ Admin grant/revoke workflow          │ B      │ Safe, re-verified, but manual-only                            │
├───────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────┤
│ Checkout / purchase flow             │ F      │ Does not exist. manualProvider is a stub. 501 always.         │
├───────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────┤
│ Free tier enforcement                │ F      │ consumeLog is dead code. FREE_LOG_LIMIT=20 is a lie.          │
├───────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────┤
│ Revocation propagation               │ D      │ DB flip → manual refresh on device. No push.                 │
├───────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────┤
│ Env separation (dev/staging/prod)    │ F      │ LICENSE_URL hardcoded for prod. No staging dashboard.         │
└───────────────────────────────────────┴────────┴──────────────────────────────────────────────────────────────┘

───

4F. Immediate Pre-Migration Actions

These are low-risk, non-controversial fixes that should happen before any payment provider work:

  1. Kill or enforce the free-tier code — delete consumeLog and FREE_LOG_LIMIT from
     entitlements.ts, or wire them into the item creation path. Half-dead monetization
     code is worse than none.

  2. Extract LICENSE_URL into EXPO_PUBLIC_LICENSE_URL — hardcoding the prod URL in
     apps/mobile/lib/license.ts blocks staging/preview testing. Use an env var so
     it can point at different deployments.

  3. Decide on HMAC receipts post-provider — if RevenueCat (or PayMongo/Xendit) handles
     receipt validation, the HMAC system becomes redundant. If keeping it, mobile should
     at minimum verify the receipt format is well-formed (even without the HMAC secret,
     it can check VERSION + 3-part structure).

───

Updated priority fixes (6-8 added beyond the original 5):

  6. Kill dead free-tier code (consumeLog, FREE_LOG_LIMIT) — enforced or deleted.
  7. Extract LICENSE_URL to env var — enable staging/preview testing.
  8. Wire a real payment provider — PayMongo/Xendit for PH-first GCash/Maya support,
     or RevenueCat Option B for Stripe+RC entitlement management.