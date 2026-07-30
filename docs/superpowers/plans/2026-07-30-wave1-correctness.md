# Wave 1 — Correctness

First of four waves from the 2026-07-30 frontend audit. This wave fixes things
that are **untrue or broken**, not things that are unpolished. Theme unification,
the Batch→Run rename, SEO/AIO and swipe navigation are later waves and are out of
scope here.

Source findings: `.superpowers/audit/mobile-ux-audit.md` (P0-1..P0-3) and
`.superpowers/audit/web-seo-ux-audit.md` (Part 2 P0 #1, #2, and the dead store
link). Read the specific finding before implementing its task.

## Global constraints

- **OTA safety is absolute.** No `@expo/ui` Compose view and no Reanimated
  worklet may be introduced. `NATIVE_UI_ENABLED` and `NATIVE_ANIMATION_ENABLED`
  stay `false`; `tests/native-ui-gate.test.ts` enforces it. Everything in this
  wave is plain JS/TSX and ships over the air.
- **`expo-crypto` is the only UUID source** in `apps/mobile`; a repo-wide guard
  test enforces it. No bare global `crypto.randomUUID()`.
- **Warehouse Console design system holds** (`DESIGN.md`). Dark-only. Acid marks
  money-positive values, progress, active selection and the single primary action
  per screen — never decoration. Tabular nums on every figure. 4pt spacing grid.
  Touch targets ≥48px. Skeletons over spinners.
- **Do not introduce new design tokens or refactor theme values.** Wave 2 owns
  that. If a fix needs a colour, use the existing token.
- **Honesty rule.** No user-facing string may claim something the code does not
  do. This wave exists largely because that rule was broken.
- Tests: mobile is jest under `apps/mobile/tests/`; web is vitest under
  `apps/web/tests/`. Gates after every task, from the repo root:
  `pnpm typecheck`, `pnpm typecheck:web`, `pnpm test`, `pnpm test:web` — all clean.
- Do not touch `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`. Do not
  run `pnpm lint` / `expo lint` — it mutates the lockfile in this repo.

## Task 1 — Pull-to-refresh gives no feedback on Home and Shop

**Finding:** mobile P0-2. `app/(tabs)/home.tsx:92` and `app/(tabs)/shop.tsx:127`
hardcode `RefreshControl refreshing={false}`. The spinner never appears, so a
pull looks like it did nothing. `lib/refresh.ts`'s `useRefresh` already tracks
the real flag, and Inventory and Batches already wire it correctly — copy their
shape.

1. Expose the real `refreshing` value through `useHomeViewModel` and
   `useShopViewModel` (they already own the refresh callback; they just do not
   surface the flag).
2. Bind it in both screens.
3. Match Inventory/Batches exactly, including the acid tint constant already used
   there (`REFRESH_TINT` in `lib/refresh.ts`). Do not invent a new appearance.
4. Tests: assert each view-model surfaces `refreshing`, and that it is true while
   a refresh is in flight and false after it settles — including when the refresh
   callback throws (`useRefresh` is documented to swallow that and still clear the
   flag).

**Done when:** pulling on Home and Shop shows the same spinner Inventory shows,
and a test fails if either screen is re-hardcoded to `false`.

## Task 2 — The "sync stuck" banner is dead code

**Finding:** mobile P0-1. `app/(tabs)/shop.tsx:131` is literally
`const stuck: number = 0; // TODO: derive from queue if needed`. The banner that
consumes it can therefore never render, so a permanently-failed publish is
invisible — the user sees "N changes pending" forever with no explanation.

This line has now been independently flagged three times: by this audit, and
twice during the shop-restore repair, where it was named as the amplifier that
makes every sync failure silent.

1. The data already exists. `lib/shop-sync.ts` exports `MAX_ATTEMPTS` and the
   publish-queue rows carry an attempt count; read `lib/shop-sync.ts` and the
   queue helpers in `lib/repo.ts` (`listPublishQueue`, `bumpAttempt`) to find the
   real source of "gave up".
2. Derive the count of permanently-failed queue rows (`attempts >= MAX_ATTEMPTS`)
   in `useShopViewModel`, not in the screen. The screen is documented as pure
   presentation.
3. Surface it so the existing banner renders, with copy that tells the user what
   to do rather than only that something failed. Keep it honest: we know the item
   stopped retrying, we do not always know why.
4. Tests: a queue row at `MAX_ATTEMPTS` produces a non-zero stuck count and the
   banner renders; a row below the threshold does not; an empty queue does not.

**Done when:** an item whose publish has exhausted its retries is visible to the
user, and a test fails if the count is stubbed back to a constant.

## Task 3 — Batches lists have no sizing

**Finding:** mobile P0-3. Both `FlatList`s in `app/(tabs)/batches.tsx` (around
lines 220 and 268) have no `style` and no `flex`, unlike every other list in the
app — including the empty-state `ScrollView` in that same file. Risks incorrect
scroll behaviour and can push the "New Batch" action off-screen on short
viewports.

1. Match the sizing pattern already used by the other tab lists. Read
   `app/(tabs)/inventory.tsx` and follow it rather than inventing a new one.
2. Verify the primary action stays reachable in the thumb zone with the floating
   tab bar present — `TAB_BAR_CLEARANCE` from `components/FloatingTabBar` is the
   existing mechanism.
3. Keep both list variants working (the screen renders more than one list state).

**Done when:** both lists size and scroll like the rest of the app and the
primary action cannot be pushed off-screen.

## Task 4 — The site misstates the pricing model, including in the Terms

**Finding:** web Part 2 P0 #1. This is the most serious item in the audit and is
a legal/trust problem, not a copy nit.

Ground truth, verified in `packages/licensing/src/index.ts`,
`apps/web/components/Pricing.tsx`, `apps/web/app/pro/page.tsx`,
`apps/web/app/account/page.tsx` and the RevenueCat webhook: **Pro is a
subscription** — ₱199/month or ₱1,799/year, 14-day free trial, cancel anytime,
billed through RevenueCat via the App Store / Play Store. `latag-pro-lifetime`
exists only as a non-purchasable legacy grandfather SKU.

The site says otherwise in three places:
- `app/page.tsx:279,281-282` — "Free forever. Pay once for the shop." and "Pro is
  a one-time unlock". `components/Pricing.tsx` renders subscription cards
  **directly beneath this text**, so the page contradicts itself in one viewport.
- `app/terms/page.tsx:12-13` — "Latag Pro is a one-time purchase".
- `app/terms/page.tsx:33-36` — "sold on this website as a one-time payment" with a
  "14 days of purchase" refund window. That model does not exist.

1. Correct the landing copy to describe the subscription accurately, in the
   product's voice. Do not oversell: state the trial, the price, and that it can
   be cancelled.
2. Rewrite the Terms' Pro and "Purchases and refunds" sections to describe what
   actually happens: recurring subscription, the 14-day free trial, **auto-renewal
   and how to cancel** (App Store / Play Store subscription management, not us),
   and that billing is handled by the store. Apple and Google both require
   auto-renewal terms to be disclosed for subscription apps; the current text
   discloses a model that is not in use.
3. Grep the whole of `apps/web` for any other "one-time", "pay once", "no
   subscription" or "refund window" claim and fix every occurrence. The three
   sites above are the known ones, not necessarily all of them.
4. Note the legacy SKU honestly if it is mentioned anywhere: existing lifetime
   holders keep access; it is not for sale.
5. Tests: add a vitest guard asserting no marketing or legal page contains
   "one-time", "pay once" or "no subscription" in reference to Pro. This is a
   claim-regression test — the same drift already happened once.

**Done when:** every page describes the same billing model the code implements,
and a test fails if the contradiction returns.

## Task 5 — Stale availability claims and a dead store link

**Findings:** web Part 2 P0 #2 and #9.

1. `app/page.tsx` says Android is "in final QA". Ground truth: version 1.2.0 is
   shipping to real subscribers over OTA with a live Play build. Correct it.
2. `app/page.tsx:78` claims "downloads and Pro purchases open together", which
   implicitly promises iOS and Android open simultaneously. **Do not simply
   delete or rewrite this from assumption** — establish what is actually true for
   each platform from the repo (`eas.json`, `app.json`, submit config, any store
   metadata) and write only what you can support. If iOS status cannot be
   determined from the repo, say so in your report and leave a precise question
   rather than inventing a claim.
3. `components/RCBuyButton.tsx` has a dead App Store link on `/pro`, the primary
   conversion page. Either point it somewhere real or remove the dead affordance —
   a link that goes nowhere on the conversion page is worse than no link.

**Done when:** no availability claim on the site outruns what the repo can
support, and there is no dead link on `/pro`.

## Task 6 — Onboarding's mode cards are a false affordance

**Finding:** reported by the owner, confirmed in code. On onboarding pane 1
(`app/onboarding.tsx:149-161`) the two mode cards are **not interactive**:
`ModeCard` (line 42) is a plain `View` with no `Pressable`, no `onPress` and no
state. Worse, `accent` is hardcoded on the Bulto card (line 159), so it renders a
permanent **acid border** — the app's own selected-state treatment per DESIGN.md.

The screen therefore shows what looks like a selected option in a two-option
picker that cannot be operated. That is worse than an obviously static card: it
invites a tap that does nothing, on the user's very first screen.

1. Make the two cards a real single-select control. One selection at a time,
   acid border on the selected card only, `Haptics.selectionAsync()` on change —
   match the existing mode toggle in `app/session/new.tsx:84-86` and the Chip
   spec in DESIGN.md rather than inventing a new selected style.
2. Accessibility: `accessibilityRole="radio"` with `accessibilityState={{ checked }}`
   (a two-option single-select is a radio group, not a button pair), an
   `accessibilityLabel` per card, and ≥48px touch targets — the cards are large,
   but confirm.
3. **Make the choice mean something.** A toggle that changes nothing is theatre
   and fails the honesty rule in the Global Constraints. Persist the pick and use
   it as the default mode in `app/session/new.tsx`, which currently hardcodes
   `useState<"selector" | "bulto">("selector")` at line 25. Use AsyncStorage with
   the existing `latag.*` key convention (see `finishOnboarding`, which already
   writes `latag.onboarded` / `latag.welcomed`).
4. There must be a defined initial state. Decide deliberately whether the screen
   opens with Selector preselected (matching today's New-Run default) or with
   neither selected, and make the copy match. Do not leave Bulto looking selected
   by accident, which is the current bug.
5. Failing-to-persist must not block onboarding — `finishOnboarding` already
   swallows storage errors and navigates anyway; follow that precedent.
6. Tests: selecting a card updates the selected state and deselects the other;
   the persisted value is read back as the New-Run default; a storage failure
   still lets the user continue.

**Done when:** both cards respond to touch, exactly one is selected at a time,
the choice survives into the first Run the user creates, and no card shows a
selected style unless it is selected.

## Out of scope for this wave

- `packages/tokens`, the type scale, the font divergence, the 52 hardcoded colour
  literals, the missing `sold` token — Wave 2.
- **The naming sweep — Wave 2.** Two renames land together there:
  - Container: `Session` (code) / `Batch` (UI) → **Run**. The SQLite table keeps
    its name behind `runs = sqliteTable("sessions", …)`; no migration.
  - Mode: `selector` → **`selections`** (owner's call, 2026-07-30). Unlike the
    container this DOES touch stored data, because `app/session/new.tsx:84-86`
    renders the raw enum value as the visible label. Verified cheap:
    `drizzle/0000_pretty_thundra.sql:36` declares `type` as plain `text NOT NULL`
    and the snapshot has `"checkConstraints": {}`, so drizzle's `{enum:[…]}` is
    TypeScript-only. The migration is a single
    `UPDATE sessions SET type='selections' WHERE type='selector'` — no table
    rebuild, unlike migration 0005.
  - `bulto` is unchanged; it is correct trade language.
  - Wave 1 deliberately uses the CURRENT names. Task 6 will be swept by Wave 2
    along with everything else — do not half-rename here.
- Structured data, canonicals, FAQ/FAQPage, `llms.txt`, meta-description length,
  the `latag.ph` domain move — Wave 3.
- Edge-swipe navigation and all P1/P2 polish — Wave 4.
- Anything requiring an `eas build`.
