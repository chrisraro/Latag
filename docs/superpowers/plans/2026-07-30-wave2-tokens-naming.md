# Wave 2 — Shared tokens and the naming sweep

Second of four waves from the 2026-07-30 frontend audit. Wave 1 (correctness)
shipped as `c91ef33`.

Source findings: `.superpowers/audit/theme-architecture-audit.md`. Read the
relevant section before implementing each task.

Owner decisions this wave implements (2026-07-30):
- **Unify the existing Warehouse Console tokens. Dark-only stays.** DESIGN.md's
  "OLED is a battery feature" rationale is a deliberate product decision; this
  wave does NOT add a light theme.
- Container renames to **Run**; the SQLite table keeps its name.
- Mode `selector` renames to **`selections`**; `bulto` is unchanged.

## What the audit found

- **Zero colour value conflicts.** All 10 shared tokens already match byte-for-byte
  between apps. The hard part is done — do not "fix" values.
- **52 hardcoded colour literals** bypass the token layer (21 mobile, 31 web). The
  worst: the entire palette is hand-copied a second time into two
  `opengraph-image.tsx` files because Satori cannot read `globals.css`.
- **`sold` is documented in DESIGN.md but exists as a named token in neither app.**
- **An undocumented 11th colour**, `#3A3A3A`, used for sheet drag handles.
- **The radius tokens are fiction.** `rounded-card` (12px) and `rounded-sheet`
  (20px) are defined and never used; the de facto card radius is **14px, used 31
  times**, with no token. DESIGN.md documents a radius the app does not use.
- **No type scale anywhere.** DESIGN.md specifies 8 entries; neither app encodes
  them. 211 inline arbitrary text sizes on mobile, 56 on web.
- **The two apps render different Archivo** — web loads the variable font via
  `next/font/google`, mobile bundles 6 static TTF cuts. Silent and un-diffable.

## Global constraints

- **OTA safety is absolute.** No `@expo/ui`, no `react-native-reanimated`, no
  `react-native-gesture-handler/ReanimatedSwipeable`. Both kill switches stay
  `false`; `tests/native-ui-gate.test.ts` enforces it.
- **This wave must not change how anything LOOKS.** It moves values behind tokens.
  Any deliberate visual change must be called out in the task report and
  justified against DESIGN.md — a silent restyle is a defect.
- **NativeWind v4 constrains what mobile can do.** It compiles Tailwind classes
  for RN and does not support arbitrary runtime CSS variables the way the web
  does. Read the installed version's capabilities before designing the shared
  layer; do not assume web techniques port.
- `expo-crypto` is the only UUID source.
- Dark-only. Do not add a light palette, a `dark:` variant strategy, or a theme
  switcher.
- Do not touch `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` **except**
  where Task 1 must register a new workspace package — that one exception is
  explicit and must be minimal. Never run `pnpm lint` / `expo lint`.
- Gates after every task, from the repo root: `pnpm typecheck`,
  `pnpm typecheck:web`, `pnpm test`, `pnpm test:web` — all clean.

## Task 1 — `packages/tokens` as the single source of truth

1. Create `packages/tokens` exporting plain TS constants: the 10 existing colour
   tokens at their CURRENT values (they already agree — copy, do not recompute),
   plus `sold` from DESIGN.md, plus the undocumented `#3A3A3A` given a real name
   and a comment saying what it is for.
2. Consume it from `apps/web`'s Tailwind config, `apps/mobile`'s Tailwind config,
   and `apps/mobile/lib/theme.ts`. Follow the existing `@latag/*` package
   conventions (see `packages/licensing`).
3. **Radii:** reconcile the fiction. DESIGN.md says cards are 12px; the app uses
   14px in 31 places. Decide which is truth, change DESIGN.md or the code to
   match — **not both silently** — and state the decision in your report. Encode
   the result as tokens.
4. **Parity test:** assert the exported tokens match DESIGN.md's table, parsed
   from the markdown rather than hardcoded, so drift becomes a build failure.
   This test is the point of the task; the refactor without it just relocates the
   problem.

**Done when:** one file defines every colour and radius, both apps read it, and a
test fails if either app or DESIGN.md drifts.

## Task 2 — Typography: encode the scale, end the font divergence

1. Encode DESIGN.md's 8-entry type scale (`display-money`, `title`, `heading`,
   `body`, `label`, `caption`, `wheel-value`, `button`) as reusable tokens in
   `packages/tokens`, expressed so both a Tailwind config and RN `style` objects
   can consume them.
2. Resolve the font divergence: web loads Archivo as a variable font via
   `next/font/google`; mobile bundles 6 static TTF cuts. Pick one truth and make
   both sides render the same weights and widths. Note mobile's DESIGN.md build
   note explicitly warns that RN's variable-font axis support is unreliable and
   that static instances must ship — respect that; the web side is the one with
   freedom to move.
3. Migrate the shared UI primitives (`apps/mobile/components/ui.tsx`, `Icon`,
   `PhotoSlot`, and the web's shared components) onto the scale. **Do NOT attempt
   all 211 mobile call sites in this task** — that is a mechanical sweep for a
   later task and would make this diff unreviewable.

**Done when:** the scale exists as tokens, the shared primitives use it, and both
apps render the same Archivo.

## Task 3 — Mobile hardcoded-literal sweep

Replace the 21 hardcoded colour literals in `apps/mobile` with token references,
and migrate the remaining inline type sizes onto the Task 2 scale where a token
exists. Where an inline value has no token and genuinely should not (a one-off
that is not part of the system), leave it and say why in your report — inventing
a token per one-off is worse than the literal.

Add a lint-style guard test that fails on a raw hex literal in
`apps/mobile/app|components|hooks|lib`, with a documented allowlist for anything
deliberately exempt.

## Task 4 — Web hardcoded-literal sweep, including the OG images

Replace the 31 hardcoded literals in `apps/web`. The two `opengraph-image.tsx`
files are the priority: they hand-copy the entire palette because Satori cannot
read `globals.css`. Import from `packages/tokens` instead — that is exactly the
problem the package exists to solve.

Add the same guard test for `apps/web`.

## Task 5 — Rename the container to Run

`Session` (code, 132 refs) and `Batch` (UI, 84 refs) are two names for one thing,
and `Session` already collides with Supabase auth sessions — `app/(tabs)/settings.tsx:5`
was forced to write `import type { Session as SupabaseSession }` to disambiguate.

1. Rename the TS type, functions, variables, routes and every user-facing string
   to **Run** / **Runs**. The test fixtures already say "Naga Run" — the team's own
   instinct.
2. **The SQLite table keeps its name.** Export it as
   `runs = sqliteTable("sessions", …)` with a comment explaining that a table
   rename would require a migration on devices holding real stock, for zero
   user-visible benefit. No migration in this task.
3. Remove the `SupabaseSession` alias — the collision is gone.
4. Route paths: decide deliberately whether `/session/*` becomes `/run/*`.
   Deep links and notification payloads may reference the old paths — check
   `lib/notifications.ts` and `notifResponsePath` before breaking anything, and
   keep the old path resolving if anything external depends on it.

**Done when:** one word names the concept everywhere, and no test or deep link
broke.

## Task 6 — Rename the mode to `selections`

Owner's call. `selector` becomes **`selections`**; `bulto` is unchanged.

1. Unlike Task 5 this DOES touch stored data, because
   `app/session/new.tsx:84-86` renders the raw enum value as the visible label.
2. Verified cheap: `drizzle/0000_pretty_thundra.sql:36` declares `type` as plain
   `text NOT NULL` and the snapshot has `"checkConstraints": {}`, so drizzle's
   `{enum:[…]}` is TypeScript-only. The migration is a single
   `UPDATE sessions SET type='selections' WHERE type='selector'` — no table
   rebuild, unlike migration 0005.
3. Write the migration, and a test that proves an existing `selector` row is
   readable as `selections` afterwards and that nothing else changed.
4. Sweep every reference: TS union, UI labels, `lib/overview.ts` math comments,
   web copy, test fixtures, and the mockup filenames if they are referenced in
   code.
5. Wave 1's `latag.defaultMode` AsyncStorage value may hold the string
   `"selector"` on a device that already onboarded. Handle that migration in the
   read path — a stale stored value must not break New Run.

**Done when:** the stored enum, the code and the UI all say `selections`, and a
device upgrading from the old build still works.

## Out of scope

- Any light theme, theme switcher, or `dark:` variants.
- SEO/AIO, structured data, the content rewrite — Wave 3.
- The privacy-page false claims and `account/page.tsx`'s `PRO_SKUS` bug — Wave 3
  (both logged in the ledger; they are truthfulness bugs, not theming).
- Edge-swipe navigation and P1 polish — Wave 4.
- Anything requiring an `eas build`.
