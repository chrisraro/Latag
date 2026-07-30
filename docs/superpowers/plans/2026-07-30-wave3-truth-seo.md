# Wave 3 — Truthfulness, SEO and AIO

Pulled ahead of the rest of Wave 2 at the owner's direction (2026-07-30), because
Tasks 1 and 2 fix statements that are currently **false to users**, which
outranks theming quality.

Wave 1 shipped as `c91ef33`. Wave 2 Task 1 (`packages/tokens`) shipped as
`00b2795`; Wave 2 Tasks 2-6 (typography, literal sweeps, Batch→Run,
selector→selections) are **deferred to a later wave** and must NOT be started
here.

Sources: `.superpowers/audit/web-seo-ux-audit.md` and the Wave 1 whole-wave
review findings recorded in `.superpowers/sdd/progress.md`. Read the relevant
finding before implementing.

## Global constraints

- **Every user-facing claim must be verifiable in this repo.** If you cannot
  find the code that makes a sentence true, the sentence is wrong — delete it or
  weaken it to what IS true. Do not invent features, regions, certifications, or
  availability. When you cannot determine something, say so in your report and
  leave a precise question rather than writing a guess.
- Ground truth for billing lives in `packages/licensing/src/index.ts`,
  `apps/web/components/Pricing.tsx` and
  `apps/web/app/api/webhooks/revenuecat/route.ts`. Pro is a **subscription** —
  ₱199/month or ₱1,799/year, 14-day free trial, billed by the store.
- `apps/web/tests/pro-claims.test.ts` is a claim-regression guard added in
  Wave 1. Extend it as claims are fixed; never weaken it.
- **This wave is web-only except where a mobile claim is the thing being
  corrected.** Do not restyle. Do not touch `packages/tokens` — Wave 2 owns it.
- Read `apps/web/AGENTS.md` first: this is a newer Next.js than training data;
  consult `node_modules/next/dist/docs/` rather than assuming APIs.
- No design token, colour or spacing changes.
- Do not touch `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`. Never run
  `pnpm lint`.
- Gates after every task: `pnpm typecheck`, `pnpm typecheck:web`, `pnpm test`,
  `pnpm test:web` — all clean.

## Task 1 — The privacy page describes features that do not exist

Highest-stakes remaining untruth in either app, and it is on a legal-adjacent
page.

1. `apps/web/app/privacy/page.tsx:39` and `apps/web/app/data/page.tsx:36` both
   claim **"anonymous usage counters"** collected with an **in-app opt-out**.
   There is no analytics or telemetry code anywhere in `apps/mobile` — grep
   `app`, `lib`, `components`, `hooks` for analytics/telemetry/tracking/optOut
   and confirm for yourself — and Settings has exactly seven rows (Storage,
   Export backup, Import backup, Offline-first, Version, Check for updates,
   Restore purchases, Sign out). Both the collection AND the promised control
   are fictional. Remove them, or replace with what is actually true.
2. Both pages claim photos are served from a **"Philippines-region CDN"**.
   Supabase offers no PH region and nothing in the repo pins one. Correct it to
   what you can support from `apps/mobile/lib/shop-api.ts` and the Supabase
   config, or drop the geographic claim.
3. `apps/web/app/data/page.tsx:29` promises that "unpublishing or deleting a shop
   item deletes its row and photos from our servers — not a soft-hide." Verify
   that end to end against `lib/shop-api.ts` `deleteShopItem` and the publish
   queue. Note the known caveat recorded in the ledger: a queue row that reaches
   `MAX_ATTEMPTS` never retries, so deletion can silently not happen. Make the
   sentence honest about what is guaranteed.
4. **Audit every other factual claim on both pages the same way** — these three
   were found by sampling, not by an exhaustive pass. Each surviving sentence
   must map to code you can cite.
5. Extend `pro-claims.test.ts` (or add a sibling guard) so a re-introduced
   analytics/opt-out claim fails the build.

**Done when:** every sentence on `/privacy` and `/data` is traceable to code, and
a test stops the fictional ones returning.

## Task 2 — Comped and grandfathered users are shown as "Free"

`apps/web/app/account/page.tsx` has three defects, the first of which directly
contradicts a sentence Wave 1 just added to the Terms.

1. `:31` filters `.in("sku", PRO_SKUS)`. `PRO_SKUS` is monthly+yearly only.
   `ENTITLING_SKUS` (introduced in `fa1e335`, which fixed exactly this in
   `app/api/license/route.ts` and `app/admin/actions.ts`) additionally covers
   `latag-pro-comp` and `latag-pro-lifetime`. So a comped or grandfathered user
   reads **"Free — unlimited inventory"** while `app/terms/page.tsx:15-17`
   promises their grant "keeps working". Fix to `ENTITLING_SKUS`.
2. `:33` uses `maybeSingle()` over what can be multiple entitling rows — a user
   holding a comp AND a subscription errors, `license` becomes null, and the page
   says "Free". This is verbatim the defect `fa1e335` fixed in `/api/license`;
   reuse that route's `pickEntitlingLicense` approach rather than reinventing it.
3. `:34,:87` select pricing `.in("sku", PRO_SKUS).limit(1).maybeSingle()` with no
   `order`, so an arbitrary row wins and the page can render
   **"Pro: ₱1,799/month"** — the yearly price labelled monthly.
4. Add `app/account/page.tsx` to `pro-claims.test.ts`'s `SURFACES`; it is a Pro
   pricing surface and was missing.
5. Tests must cover: comp user sees Pro, lifetime user sees Pro, a user with two
   entitling rows resolves without error, and the monthly price renders as
   monthly.

**Done when:** every entitled user sees their real status, and the price label
matches the period.

## Task 3 — SEO foundations

From the audit's Part 1 P0/P1. Concrete tags, not descriptions of tags.

1. **Canonicals.** `alternates.canonical` is missing on every marketing/legal
   page — `app/page.tsx`, `pro`, `account`, `account/sign-in`, `data`, `privacy`,
   `terms`. Only the shop routes set one. Add to each route's `metadata`.
2. **Root meta description** (`app/layout.tsx:12`) is ~216 chars and truncates
   at ~155. Rewrite it tight and specific.
3. **`twitter` metadata object** is absent; `openGraph` is set. Add
   `twitter: { card: "summary_large_image", … }` in the root layout.
4. **`viewport.themeColor`** — nothing exports `viewport`. Add it per the Next
   version's `generateViewport` docs in `node_modules/next/dist/docs/`.
5. Verify `robots.ts` and the sitemap actually cover every public route,
   including dynamic shop routes, and that nothing public is noindexed.

## Task 4 — Structured data

`grep` for `ld+json` across `apps/web` currently returns **nothing**.

- `app/layout.tsx`: `Organization` + `WebSite`.
- `app/page.tsx`: `SoftwareApplication` with `applicationCategory:
  "BusinessApplication"`, and an `offers` array mirroring the REAL subscription
  SKUs and prices. Cross-check against `packages/licensing` before writing any
  `price`.
- `app/shop/[handle]/page.tsx`: `ItemList`.
- `app/shop/[handle]/[item]/page.tsx`: `Product` + `Offer` with `priceCurrency:
  "PHP"` and `availability` derived from the item's real status.
- Emit as `<script type="application/ld+json">`. Do not hand-concatenate JSON
  strings — serialise properly and escape correctly.
- Add a test asserting each page emits valid, parseable JSON-LD with the
  expected `@type`, so this cannot silently regress.

## Task 5 — AIO: make the product answerable

1. Write real FAQ content answering what the product is, who it is for, what it
   costs, whether it works offline, and what happens to seller data. Every
   answer must be true per Tasks 1-2. Mark it up as `FAQPage` JSON-LD.
2. Add `public/llms.txt` summarising what Latag is, who it serves, current
   pricing, and links to the key routes. `robots.ts` already allows AI crawlers.
3. Structure the landing page so an answer engine can extract claims: clear
   question-shaped H2s where natural, one H1 per page, factual self-description.
   Do not bolt on an eyebrow above every section — that is an AI tell, not
   structure.

## Task 6 — Content accuracy: say what the app actually does

1. The landing page never mentions **multi-device backup and restore**,
   **restoring published listings after a data wipe**, or **Instagram caption
   export** — all shipped and all central to the product's purpose. Verify each
   in `apps/mobile` before writing about it, then add them.
2. `components/Pricing.tsx:86-92` — "Cancel anytime in your account settings" is
   false (cancellation is store-side) AND is dead code: the `detailed` prop is
   passed by no call site. Delete the branch rather than rewording it.
3. `components/Pricing.tsx:41,66` apply `cursor-pointer` and `hover:border-acid/60`
   unconditionally, but the only call site passes no `onSelect`, so the cards are
   inert — the same false-affordance class of bug that Wave 1 fixed in
   onboarding. Gate the interactive styling on `onSelect`.
4. `components/RCBuyButton.tsx:20` says "Apple & Google handle the payment" above
   a Google-Play-only button, and `terms/page.tsx:36-46` routes cancellation and
   refunds through Apple. Wave 1 deliberately removed the iOS affordance because
   iOS status is undeterminable from the repo. Make the copy consistent with
   Android-only reality, written so adding iOS later is a small edit.
5. `privacy/page.tsx`'s "PCI-DSS compliant payment provider" is generic and odd
   for store-billed purchases. Tighten to what is true: the stores process
   payment and no card data reaches Latag's servers.

**Open question for the owner, do not guess:** whether the Google Play listing is
public production or closed testing. If closed, the store link added in Wave 1
dead-ends for every visitor. Flag it; do not assert either way.

## Out of scope

- Wave 2 Tasks 2-6 (typography, font parity, literal sweeps, Batch→Run,
  selector→selections). Use CURRENT names throughout this wave.
- Edge-swipe navigation and P1 polish — Wave 4.
- The two-card-radii reconciliation — owner decision, logged.
- The `drainQueue` network-attempt fix — sync engine, later wave.
- Anything requiring an `eas build`.
