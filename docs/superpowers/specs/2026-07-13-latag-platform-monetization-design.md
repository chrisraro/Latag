# Latag Platform & Monetization — Design Spec

**Date:** 2026-07-13
**Status:** Approved via product-owner direction (this session)
**Companion to:** `2026-07-13-latag-mvp-design.md` (mobile MVP spec — still authoritative for the core offline loop)

---

## 1. What This Adds

Latag is not just the mobile app. The product is a **monorepo containing two applications**:

1. **`apps/mobile`** — the Expo offline-first app (spec #1).
2. **`apps/web`** — one **monolithic Next.js 15 app** serving four surfaces: the marketing landing page, the user web portal (account + Pro purchase), the owner admin console, and the legal/trust pages. Plus the existing telemetry API.

**Why web payments:** Pro is settled on the website, not through Play Store / App Store in-app purchase, to avoid the 15–30% store commission. The app itself never sells anything — it links out to the website (this is policy-compliant as long as the mobile app doesn't offer its own purchase flow; the "reader app"/external-purchase landscape is noted as a launch-time compliance check).

## 2. Business Model — Freemium

| | Free | Pro (one-time lifetime unlock) |
|---|---|---|
| Item logs | **20 lifetime** | Unlimited |
| Sessions | Unlimited | Unlimited |
| Photos, dashboards, IG export | Full | Full |
| Price | ₱0 | Set in admin console (single SKU, adjustable) |

**Free-tier mechanics (exact):**
- A "log" = one **item creation**. The counter is lifetime-per-account (per-device before sign-in exists), regardless of how logs are spread across sessions.
- Edits are free. Deleting an item does **not** refund a credit (prevents log-delete-log cycling).
- The counter lives in local SQLite (`entitlements` table) so it works fully offline; it reconciles with the server when the licensing phase ships. MVP ships the counter device-local — accepted limitation: a reinstall resets it. Good enough for launch; server reconciliation closes the hole when auth arrives.
- UX: remaining-logs indicator surfaces in the Rapid Console header once ≤ 10 remain (`7 free logs left`), styled as data, not a nag. At 0, SAVE + NEXT is replaced by a **Go Pro sheet** (standard sheet component): what Pro is, the one-time price, and "Unlock on the website — latag.ph/pro". No purchase flow inside the app.

**Pro licensing flow:**
1. User buys Pro on the web portal (signed in with the same account the app uses).
2. Payment webhook marks the account `pro` in the licenses table (Supabase Postgres — consistent with the blueprint's "Supabase for Auth (licensing)").
3. Mobile app, next time it has connectivity + sign-in, fetches a **signed license receipt** and caches it locally. From then on Pro works 100% offline, forever. No periodic phone-home; offline-first is non-negotiable.

## 3. Payments

- **Provider: deliberately abstracted.** All payment logic sits behind a `PaymentProvider` interface (create checkout, verify webhook, fetch payment status). Candidates: PayMongo / Xendit (both cover GCash, Maya, cards — how PH buyers actually pay); final pick happens in the web build phase after sandbox testing both.
- Never store card/e-wallet credentials — checkout is provider-hosted; we store only: provider payment ID, amount, status, timestamp, account ID.
- Single SKU (`latag-pro-lifetime`), price read from the admin-managed pricing table at checkout time.

## 4. Web App Surfaces (`apps/web`, Next.js 15 App Router, monolith)

### 4.1 Landing page `/`
Showcases the app in the same "Warehouse Console" design language (dark, acid, Archivo, phone mockups reused as visuals). Sections: hero (offline promise), the two modes, 5-second logging, IG export, pricing (Free vs Pro), download links, footer with legal links. Copy gets a **writing-guidelines review pass** before launch.

### 4.2 Web portal `/account`
Supabase-authenticated. Shows: license status (Free — X of 20 logs used, or Pro), **Buy Pro** checkout entry, purchase receipt/history, feedback & suggestions form, account deletion (removes account + license + feedback; inventory never existed server-side — stated right there in the UI).

### 4.3 Admin console `/admin`
Owner-only (role-gated single admin account). Provides:
- **Users:** list/search accounts, license status, sign-up date, log-count telemetry (aggregate).
- **Pricing:** edit the Pro SKU price (takes effect on next checkout).
- **Features:** feature-flag table (drives future staged rollouts).
- **Feedback & suggestions:** inbox of portal submissions (status: new/reviewed/done).
- **Feature requests:** same inbox pattern; later fed by an in-app submission form (post-MVP mobile feature).
- **Telemetry:** the Upstash counters visualized (items logged, active regions).

### 4.4 Legal & trust pages `/privacy`, `/terms`, `/data`
Written for real humans, reviewed with **writing-guidelines**. They must state — truthfully:
- **Inventory, sessions, and photos never leave the phone.** There is no cloud copy; the company cannot see them. On-device data is protected by the phone's OS-level at-rest encryption.
- **Account data** (email, license) is encrypted in transit (TLS) and at rest (Supabase infrastructure), used only for licensing.
- **Payments** are processed by a PCI-DSS-compliant provider; Latag never sees or stores card/e-wallet credentials.
- **Telemetry** is anonymous counters only (no items, no photos, no names) with an in-app opt-out.
- Account deletion is self-serve and complete.
These commitments are product constraints, not marketing: any future feature that would violate them requires updating these pages first.

### 4.5 API routes (same monolith)
- `POST /api/telemetry` — Upstash Redis INCR/HINCRBY (existing spec).
- `POST /api/webhooks/payments` — provider webhook → license grant (idempotent).
- `GET /api/license` — authenticated; returns signed license receipt for mobile caching.

## 5. Data (server-side, Supabase Postgres)

`profiles` (id = auth uid, email, created_at) · `licenses` (account, sku, status, granted_at, payment_id) · `payments` (provider, provider_ref, amount, currency, status, account, created_at) · `pricing` (sku, price, currency, active) · `feedback` (account nullable, type: feedback|suggestion|feature_request, body, status, created_at) · `feature_flags` (key, enabled, notes).

Mobile local addition (MVP): `entitlements` (single row: logs_used int, pro bool, license_receipt text nullable).

## 6. Build Order (approved)

1. **Phase A — Mobile MVP** (spec #1 core loop) **+ monorepo scaffold + free-tier counter**: pnpm workspace with `apps/mobile` and a stub `apps/web`; the 20-log counter and Go Pro sheet ship in the MVP so the model is enforced from v1 (sheet links to the future site).
2. **Phase B — Web platform:** landing, legal pages, portal, admin console, payments integration (provider picked here), license API. **B2 SHIPPED 2026-07-14** (schema+RLS, OTP auth, portal, admin with manual Pro grants, signed-receipt license API; payments adapter pending provider sandbox).
3. **Phase C — Mobile licensing:** Supabase sign-in in app (Welcome/OTP screens already designed), license receipt caching, counter reconciliation, telemetry sync.
4. **Later:** in-app feature-request form, CSV export, bottoms/v2 categories.

## 7. Out of Scope / Explicit Non-Goals

- No native in-app purchases, ever, unless store policy forces it.
- No cloud sync/backup of inventory (would break the core privacy promise; if ever added it must be opt-in, end-to-end encrypted, and preceded by a legal-pages update).
- No multi-admin roles, org accounts, or team features.
- No trial-period timers; the free tier is the trial.
