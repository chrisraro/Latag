# Latag Phase F — Inventory-First Pivot + Seller Storefronts

**Date:** 2026-07-27 · **Status:** Approved · **Depends on:** Phases A–E shipped, custom SMTP live

## 1. What changes and why

Latag becomes a **pure ukay inventory management system** with a **publishable storefront**. Sessions stop being the front door; inventory does. Sellers can publish chosen items to a public e-commerce-style page and receive buyer inquiries through Messenger, Instagram, or email.

Decomposed into three sub-phases, **all OTA-shippable** (no new native modules; pure-JS packages bundle into OTA payloads, and web deploys are outside the OTA constraint):

- **F1 — Inventory-first + floating tab bar** (mobile only)
- **F2 — Storefront** (mobile + web + one Supabase migration)
- **F3 — Inquiry routing** (small; rides on F2's web surface)

### Owner decisions (2026-07-27)

1. Sessions **demoted to sourcing batches** — Bulto capital-recovery math preserved.
2. Shop sync = **opt-in per item, then automatic** for subsequent changes.
3. Tabs = **Inventory · Batches · Shop · Settings**, floating native bar.
4. Monetization = **Free: unlimited local inventory · Pro: the storefront**. The 20-item lifetime cap is removed.

### The privacy repositioning (deliberate, load-bearing)

Latag currently promises 8 times across app, landing, and policy that data "never leaves this phone." A public storefront breaks that literally, so the promise **sharpens** rather than disappears:

> **Nothing leaves your phone unless you publish it — and you choose exactly what, one item at a time.**

Cost, profit, margins, supplier locations, batch data, and unsold stock stay local **permanently**. Only published items go up, carrying only buyer-relevant fields. This is enforced structurally: `shop_items` has **no columns** for cost, profit, location, or batch. Copy on the landing page, privacy page, data page, onboarding, and Settings must be updated to the sharpened promise — no stale absolutes left anywhere.

## 2. F1 — Inventory-first + floating tab bar (SHIPPED 2026-07-27)

> DB mapping: the `sessions` table keeps its name; UI copy says "Batches". Android notification channel id stays `session-reminders` (renaming it would orphan the channel on installed devices); only its display name changed.

**No schema change.** Vocabulary + navigation refactor only; the `sessions` table keeps its name (documented mapping: DB `sessions` = UI "Batches"). Migration risk ~zero.

### Floating tab bar

- `expo-router` Tabs at root with a custom bar component.
- iOS: `GlassView` (expo-glass-effect, already installed) for native liquid glass. Android: solid `surface1` pill + `hairline` border — must look deliberate, not like failed blur.
- Rounded-full, floating above the safe-area inset, acid active state, Phosphor icons (`Package`, `Stack`, `Storefront`, `GearSix`), 44px+ targets, a11y labels.

### Tabs

| Tab | Contents |
|---|---|
| **Inventory** (home) | All items across all batches. Search (brand/name), filter chips (department · status available/sold · published), sort (newest / price / oldest). FlashList, existing row component. |
| **Batches** | Today's sessions screen verbatim — Active \| Scheduled sub-tabs, bale cost, capital recovery, map pins, reminders all preserved. |
| **Shop** | Storefront manager (F2). Pre-setup: value-proposition + "Set up shop" CTA. |
| **Settings** | Unchanged, plus a Shop settings entry. |

### Free-tier change

`FREE_LOG_LIMIT` gating is removed from the save path; `entitlements.logsUsed` stays in the schema (no migration) but stops blocking. `GoProSheet` no longer triggers on item save — it moves to the publish action in F2. Copy updated wherever the 20-item cap is mentioned.

## 3. F2 — Storefront (SHIPPED 2026-07-27)

### Supabase (migration `0003_storefront.sql`)

- **`shops`**: `id`, `user_id` (unique, FK auth.users), `handle` (unique, citext, `^[a-z0-9-]{3,20}$`), `display_name`, `bio`, `avatar_url`, `contact_messenger`, `contact_instagram`, `contact_email`, `show_sold` (bool, default false), `is_published`, `created_at`, `updated_at`.
- **`shop_items`**: `id`, `shop_id` (FK), `code` (short human-readable `LT-XXXXX`, unique per shop — the inquiry fallback), `item_local_id` (device uuid — unique per shop, enables idempotent upsert), `brand`, `name`, `department`, `category`, `condition`, `specs` (jsonb — the department's measurements only), `price`, `status` (`available`/`sold`), `photo_urls` (text[]), `sort_order`, `published_at`, `updated_at`. **No cost, profit, location, or batch columns — by design.**
- **RLS**: public `select` on `shops` where `is_published`; public `select` on `shop_items` where the parent shop is published and (`status = 'available'` or the shop's `show_sold`). All writes owner-scoped via `auth.uid() = shops.user_id`, so mobile writes directly — no API layer.
- **Storage**: bucket `shop-photos`, public read, authenticated write scoped to `{user_id}/…`. Max **4 photos per published item**.

### Mobile

- **Shop setup** (Pro gate): handle picker with live availability check, display name, bio, contact methods. Free users see the value proposition + Go Pro.
- **Publish**: item detail gains a **Publish to shop** toggle. On enable: upload the existing 1200px compressed photos, upsert `shop_items`.
- **Sync engine**: local `publish_queue` table (`item_id`, `op` enqueued/`update`/`delete`, `attempts`, `last_error`). Any change to a published item enqueues an update; drained when online with retry + backoff. Never blocks the UI. Shop tab surfaces pending count honestly ("3 changes pending — will sync when you're online"). Sold items drop off automatically.
- **Unpublish**: removes the row and its storage objects.

### Web (Next.js)

- `/shop/[handle]` — seller header (name, bio, avatar) + item grid (photo, price, size line, condition), department filters.
- `/shop/[handle]/[item]` — photo carousel, full specs, price, inquiry buttons (F3).
- Per-shop and per-item `opengraph-image` so shared links preview; sitemap entries; ISR revalidation for freshness.
- "Made with Latag" footer on every shop (growth loop).

### Storage economics

Free tier: 1GB ≈ 3,000–6,000 photos at current compression; 5GB/month egress. Mitigations: 4-photo cap per item, Vercel image optimization, lazy loading. Revisit when approaching limits.

## 4. F3 — Inquiry routing (SHIPPED 2026-07-27, inside F2)

Seller configures three handles in Shop settings (`contact_messenger`, `contact_instagram`, `contact_email`); the item page renders a button per configured channel. **Researched and verified 2026-07-27** — prefill support differs per channel, and the design follows the evidence rather than assuming parity.

### Per-channel behaviour

| Channel | Prefill | Template |
|---|---|---|
| **Messenger** | **Yes** — documented by Meta, verified through the live redirect chain; works for Pages **and** personal profiles | `https://m.me/{handle}?text={encoded}` |
| **Instagram** | **No** — `ig.me` discards query params; only `ref` exists and it is bot-webhook-only | `https://ig.me/m/{handle}` + clipboard copy |
| **Email** | **Yes** | `mailto:{addr}?subject={encoded}&body={encoded}` |

Evidence: Meta's [m.me links doc](https://developers.facebook.com/documentation/business-messaging/messenger-platform/discovery/m-me-links) (updated 2026-03-23) documents `text`; the redirect trace resolves to `fb-messenger-public://user-thread/{id}?text=…` with the text intact. Meta's [ig.me doc](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/ig-me-links) documents only `ref`, and `ig.me/m/x?text=Hello` was observed dropping the parameter.

### Message composition

One builder produces the text for every channel, so the buyer's message reads the same everywhere:

```
[LT-7K2Q9] Hi! Is this still available?
Carhartt Detroit Jacket — 9/10 — ₱850
https://latag.vercel.app/shop/{handle}/{item}
```

- **Short item code first** (`LT-XXXXX`, generated per published item, stored on `shop_items.code`, shown on the listing page). If prefill fails for any reason, the buyer can type six characters and the seller still knows the exact item. This is the fallback that makes every other failure survivable.
- Keep the body short — long strings risk truncation and read as spam.
- Subject line for email: `Inquiry: {brand} {name} ({code})`.

### Belt-and-braces rules

- **Copy to clipboard on every channel tap**, including Messenger. Prefill failing then degrades to a paste instead of a dead end; it costs nothing.
- Instagram shows a toast: "Message copied — paste it in the DM."
- **Desktop fallback**: `ig.me` is mobile-app-only (per Meta's own limitations). On desktop, link to `instagram.com/{handle}` and render the message as selectable text instead of firing a link that dead-ends.
- Also provide "Copy link" and native Web Share.

### Verify on device before shipping

The Messenger evidence is documentation + redirect-chain analysis, not pixels observed in a composer. One credible 2023 Stack Overflow answer asserts prefill is disallowed — it was answering about `messenger.com/t/?text=`, which genuinely does not work, so it appears mis-scoped rather than contradictory. Meta's [platform policy](https://developers.facebook.com/devpolicy/) also restricts prefilled content to text created by the user or by a business whose employees use the app; a seller's own listing text on the seller's own shop plausibly qualifies, and Meta documents the parameter itself. **F3's QA must confirm on one Android and one iPhone that the text lands in the composer un-sent.** If it does not, the clipboard path already covers it and only the toast copy changes.

## 5. Cross-cutting

- **Offline-first**: unchanged for the core loop. New network surfaces (photo upload, shop sync) live behind the publish queue, degrade silently, and never block logging. Sanctioned-network-file list grows by `lib/shop-sync.ts` and `lib/shop-api.ts`.
- **Testing**: TDD for sync-queue state machine, handle validation, spec→jsonb mapping, mailto/m.me/ig URL builders, inventory filter/sort logic. Device QA gains an F section.
- **UI/UX**: Warehouse Console tokens throughout; 8pt rhythm; 44px targets; honest copy.
- **Ship path**: each sub-phase ships OTA (F2 additionally needs a Vercel deploy + migration). `eas update` publishing rules from the ledger apply unchanged.

## 6. Out of scope (backlog)

Custom domain + real Resend sender (currently test mode), payments/PayMongo, Google OAuth, Insights/analytics tab, buyer accounts or carts (inquiry-only by design), in-app messaging.
