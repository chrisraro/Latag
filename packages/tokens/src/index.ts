/**
 * Design tokens — the single place a Warehouse Console color or radius value
 * is written down. DESIGN.md's tables are the specification; this file is
 * their code counterpart. `apps/web/tests/design-tokens.test.ts` parses
 * DESIGN.md's markdown directly and fails if this file, `apps/mobile/lib/theme.ts`,
 * `apps/mobile/tailwind.config.js`, or `apps/web/app/globals.css` disagree
 * with it.
 *
 * Do not add a hex or radius literal anywhere else in the monorepo. Add it
 * here, once, and let every consumer derive from it.
 */

/**
 * Canonical color values, keyed exactly as DESIGN.md's "Token" column
 * (kebab-case). This is the map the parity test diffs directly against
 * DESIGN.md.
 */
export const DESIGN_COLORS = {
  bg: "#000000",
  "surface-1": "#111111",
  "surface-2": "#1A1A1A",
  hairline: "#262626",
  ink: "#F2F2F2",
  "ink-dim": "#ADADAD",
  "ink-faint": "#8A8A8A",
  acid: "#B8F135",
  "acid-ink": "#141A05",
  danger: "#FF5A3C",
  sold: "#8A8A8A",
} as const;

/**
 * The sheet drag-handle bar (the small horizontal "grabber" pill at the top
 * of a bottom sheet — BrandPickerSheet, session/edit, session/new,
 * shop/setup, item/[id]/sold). In live use in `apps/mobile` since before this
 * package existed, but never documented in DESIGN.md and never named — every
 * call site hand-typed `bg-[#3A3A3A]`. Named here so it stops being a bare
 * hex literal copy-pasted across five files. Deliberately kept out of
 * `DESIGN_COLORS`/DESIGN.md's table: it is a UI-chrome color, not one of the
 * documented semantic tokens (bg/surface/ink/acid/danger/sold).
 */
export const handle = "#3A3A3A" as const;

/**
 * camelCase view of `DESIGN_COLORS` (plus `handle`) for direct JS/style-object
 * property access, e.g. `style={{ color: COLORS.inkFaint }}`.
 * `apps/mobile/lib/theme.ts` re-exports this as-is.
 */
export const COLORS = {
  bg: DESIGN_COLORS.bg,
  surface1: DESIGN_COLORS["surface-1"],
  surface2: DESIGN_COLORS["surface-2"],
  hairline: DESIGN_COLORS.hairline,
  ink: DESIGN_COLORS.ink,
  inkDim: DESIGN_COLORS["ink-dim"],
  inkFaint: DESIGN_COLORS["ink-faint"],
  acid: DESIGN_COLORS.acid,
  acidInk: DESIGN_COLORS["acid-ink"],
  danger: DESIGN_COLORS.danger,
  sold: DESIGN_COLORS.sold,
  handle,
} as const;

/**
 * Lowercase, hyphen-free view of `DESIGN_COLORS` (plus `handle`) for Tailwind
 * `theme.colors` keys. Tailwind/NativeWind generate utility class names
 * directly from these object keys (`bg-inkdim`, `text-acidink`, …) — the
 * app's existing className usages were written against this exact casing, so
 * it is preserved here rather than "fixed" to camelCase.
 * `apps/mobile/tailwind.config.js` reads this.
 */
export const TAILWIND_COLORS = {
  bg: DESIGN_COLORS.bg,
  surface1: DESIGN_COLORS["surface-1"],
  surface2: DESIGN_COLORS["surface-2"],
  hairline: DESIGN_COLORS.hairline,
  ink: DESIGN_COLORS.ink,
  inkdim: DESIGN_COLORS["ink-dim"],
  inkfaint: DESIGN_COLORS["ink-faint"],
  acid: DESIGN_COLORS.acid,
  acidink: DESIGN_COLORS["acid-ink"],
  danger: DESIGN_COLORS.danger,
  sold: DESIGN_COLORS.sold,
  handle,
} as const;

/**
 * Corner-radius tokens.
 *
 * DESIGN.md originally documented cards at 12px. In practice `apps/mobile`
 * has used 14px (`rounded-[14px]` / `borderRadius: 14`) at every real card
 * call site since before this package existed — `rounded-card`/12px was
 * defined in `tailwind.config.js` and never referenced anywhere. Wave 2
 * Task 1 resolved that conflict by promoting the app's actual 14px to the
 * documented value (DESIGN.md updated to match) rather than rewriting every
 * call site to 12px, since the latter would visibly shrink every card
 * corner — a real rendering change this task is not supposed to make.
 * `card` below is therefore 14, matching the app as it exists today.
 */
export const RADIUS = {
  /** Chips & buttons: fully rounded pill shape (Tailwind `rounded-full`). Not a fixed px value; 9999 is the conventional "large enough to always be a pill" number. */
  pill: 9999,
  /** Cards. See module comment re: the 12px → 14px reconciliation. */
  card: 14,
  /** Modal sheet top corners. */
  sheet: 20,
  /** Photo slot squares. */
  photo: 10,
} as const;
