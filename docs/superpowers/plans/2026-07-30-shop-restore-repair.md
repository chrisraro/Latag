# Shop restore repair — published listings must come back after a data wipe

## Problem

A user whose device data was cleared signs in to an account with a published
shop and listings. Nothing is restored, and nothing tells them why.

`restorePublishedItems` (`apps/mobile/lib/shop-restore.ts`) has **no test
coverage** — `tests/shop-restore.test.ts` exercises only the pure helpers
`parseSpecValue` and `SPEC_LABEL_TO_KEY`. Two defects survived in the
untested body, and a third makes both invisible.

### A — bare global `crypto.randomUUID()` (active failure)

Lines 134 and 179 call the global `crypto.randomUUID()`. Every other module
uses `Crypto.randomUUID()` from `expo-crypto` (`lib/repo.ts:10`,
`lib/brands.ts:10`, `lib/media.ts:26`). Nothing in the project installs a
`crypto` global and neither React Native nor Expo provides one, so on Hermes
this throws `TypeError`. The catch-all at line 192 swallows it and returns
`{ restored: 0, skipped: 0 }`.

It passes CI because Node provides `crypto.randomUUID` natively — the test
environment does not resemble the device.

### B — unscoped shop lookup (latent, fires on the second published shop)

Lines 99-102:

```ts
supabase.from("shops").select("id").single()
```

No `user_id` filter. Live RLS on `public.shops` has a `public shops` SELECT
policy with qualifier `is_published`, so an authenticated user can read every
published shop. With one shop in the database `.single()` returns one row by
luck; with two it errors and restore returns empty. `getMyShop`
(`lib/shop-api.ts:285`) shows the correct shape: `.eq("user_id", userId)`
plus `.maybeSingle()`.

### C — failure is indistinguishable from "nothing to restore"

`RestoreResult` is `{ restored, skipped }`. Every failure path returns zeros,
which is also what a genuinely empty shop returns. Neither the user nor a log
can tell the difference.

### D — restore is a one-shot that locks itself out

It runs only inside `completeSignIn`, and only when
`db.select().from(items).all().length === 0`. Once any item exists locally it
can never run again, so a single failure is permanent short of another wipe.

## Global constraints

- **`expo-crypto` is the only UUID source.** No bare `crypto.randomUUID()`,
  no `Math.random()` ids.
- **Restore stays idempotent.** Items are skipped when `shopCode` already
  exists locally. Re-running must never duplicate a listing.
- **Restore never crashes the app.** It is called from the sign-in flow and
  from UI handlers; it must not throw or reject.
- **Privacy boundary is unchanged.** `shop_items` carries no cost, profit,
  location or batch data. Restored items keep `individualCost: 0`,
  `sessionId: null`, `soldPrice: null`. Do not invent these values.
- **Toast on failure only.** A restore that succeeds with nothing to do stays
  silent. Never report a failure as success.
- **Supabase reads are scoped by `user_id`,** never left to RLS alone.
- Existing behaviour to preserve: photos restore as remote Supabase URLs in
  `photos.localUri` (documented, by design), and `sort_order` descending.
- Tests: jest, `apps/mobile/tests/`. Use `makeTestDb()` from
  `tests/helpers/testDb.ts` for a real in-memory SQLite DB; mock only the
  network boundary (`lib/supabase`).
- Gates after every task: `pnpm typecheck` and `pnpm test` from the repo
  root, both clean.

## Task 1 — Restore is a silent no-op on device: use expo-crypto

**Why:** defect A. This alone is why the user got nothing back.

1. Build the missing test harness for `restorePublishedItems` in
   `apps/mobile/tests/shop-restore.test.ts` (keep the existing helper tests):
   mock `../lib/supabase` so `from("shops")` and `from("shop_items")` return
   controllable rows, and use `makeTestDb()` for the local side.
2. Write a failing test proving the device behaviour: with `globalThis.crypto`
   removed for the duration of the test (restore it in `afterEach`),
   restoring one published item must still insert one row. Today this throws
   internally and reports zero restored.
3. Fix: import `* as Crypto from "expo-crypto"` and use `Crypto.randomUUID()`
   at both call sites. Note `tests/helpers/setup.ts` already mocks
   `expo-crypto`.
4. Add a guard test that greps the `apps/mobile` sources (`lib/`, `app/`,
   `hooks/`, `components/`, `db/`) and fails if any file references the bare
   global `crypto.randomUUID` — the codebase convention, made enforceable.
   Exclude comments and the guard test itself.

**Done when:** a restore inserts items with no global `crypto`, and the guard
test fails if someone reintroduces the bare global.

## Task 2 — Restore breaks once a second shop is published: scope the query

**Why:** defect B.

1. Failing test: the mocked `shops` table contains the user's shop **and**
   another user's published shop. Assert the user's own items are restored
   and that the query was scoped by `user_id` — not that it happened to pick
   the right row.
2. Failing test: the user has no shop at all — restore reports nothing to do
   and does not treat it as an error.
3. Fix `restorePublishedItems` to resolve the current user id (mirror
   `currentUserId()` usage in `lib/shop-api.ts`) and query
   `.eq("user_id", userId).maybeSingle()`.

**Done when:** restore selects the caller's shop explicitly and a second
published shop in the table changes nothing.

## Task 3 — Restore cannot report failure: give it a typed outcome

**Why:** defect C. Required for the toast in Task 4 to be honest.

1. Replace `RestoreResult` with a discriminated union covering the three
   real outcomes: restored/skipped counts on success, and a distinct failure
   carrying a reason (shop lookup failed, items fetch failed, unexpected
   error). Keep counts available on success.
2. Failing tests for each outcome: success with items, success with nothing
   to restore, shop lookup error, items fetch error, and an unexpected throw
   mid-insert — the last must still not propagate.
3. Update the caller in `lib/auth-complete.ts`: keep the existing success
   toast, and on failure show `showError` with a short honest message. A
   successful restore of zero items stays silent. The sign-in flow must still
   never throw.

**Done when:** every caller can distinguish failure from an empty shop, and
the sign-in path surfaces a failure without breaking sign-in.

## Task 4 — Restore is unreachable after the first item: manual action

**Why:** defect D. Recovery must not depend on catching the one-shot
sign-in window.

1. Add a user-triggered restore to the Shop tab
   (`apps/mobile/app/(tabs)/shop.tsx`, State 3 — the shop exists). Follow the
   screen's existing button and busy-state conventions; check
   `components/ui` before adding anything new.
2. Behaviour: disabled while running; on success with `restored > 0` a
   success toast naming the count; on success with `restored === 0` a brief
   "already up to date" success toast (the user asked, so answer them); on
   failure the Task 3 error toast. Re-running must not duplicate listings.
3. Tests in `apps/mobile/tests/`: cover the handler's outcome mapping. Follow
   the existing screen-test approach in `tests/shop-tab.test.tsx`.

**Done when:** a user who already has local items can still pull their
published listings back, repeatedly and safely.

## Out of scope

- Downloading restored photos into local cache (they stay remote URLs).
- Recovering cost, profit, batch or location data — never uploaded, by design.
- Any change to the RLS policies or the storefront web app.
- RevenueCat configuration.
