# Latag Web

Next.js App Router app serving three surfaces:

- the **marketing site** (`/`, `/pro`, `/privacy`, `/terms`, `/data`, `/faq`),
- the **public storefront** for sellers' published listings
  (`/shop/[handle]` and `/shop/[handle]/[item]`),
- **account and admin** (`/account`, `/admin`), plus the API the mobile app
  depends on: `/api/license` and the RevenueCat webhook.

Read `AGENTS.md` in this directory before writing any code — this is a newer
Next.js than most training data, and the guide points at the installed docs.

## Running it

This is a pnpm workspace — install from the repo root.

```bash
pnpm install          # repo root
pnpm web              # or: pnpm -C apps/web dev
```

## Gates

```bash
pnpm typecheck:web    # tsc --noEmit
pnpm test:web         # vitest
pnpm web:build        # next build
```

## Claim guards

Two vitest suites exist specifically to stop marketing and legal copy drifting
away from what the code does — `tests/pro-claims.test.ts` and
`tests/privacy-claims.test.ts`. They read the real page sources from disk and
fail the build on a reintroduced false claim (for example describing the
subscription as a one-time purchase, or advertising analytics the app does not
collect). Both drifts had already shipped once. If you change pricing, billing,
or data-handling copy, expect these to be the tests that catch you.

Pro is a **subscription** — ₱199/month or ₱1,799/year with a 14-day trial,
billed through the store via RevenueCat. `packages/licensing` is the single
source of truth for SKUs; `ENTITLING_SKUS` (not `PRO_SKUS`) is what grants
access, because it also covers comped and grandfathered users.
