/** @type {import('tailwindcss').Config} */
// Loaded by apps/web/app/globals.css via `@config "../tailwind.config.cjs"`.
//
// Tailwind v4's CSS-first @theme block can't import a JS/TS value at build
// time, but `@config` (a CSS at-rule Tailwind v4 ships specifically to load
// a legacy JS/CommonJS config) can — and it merges `theme.extend` into the
// real design system used by `@tailwindcss/postcss`, which is exactly what
// this app's postcss.config.mjs runs. Verified by compiling a minimal case
// through the installed tailwindcss@4.3.2 engine before wiring this in for
// real: a `require()`d JS color object came out the other end as literal
// values in generated utility CSS.
//
// `theme.extend` (not a full `theme` replacement) so Tailwind's default
// palette — which apps/web still uses directly in a couple of places
// (`bg-black`, `bg-white`) — stays available alongside these tokens.
//
// No `content` array: v4's automatic source detection (via
// `@tailwindcss/postcss`) scans the project itself and does not consult a
// legacy config's `content` list, so one isn't declared here to avoid
// implying it does something it doesn't.
const { TAILWIND_COLORS, RADIUS } = require("@latag/tokens");

module.exports = {
  theme: {
    extend: {
      colors: { ...TAILWIND_COLORS },
      borderRadius: {
        card: `${RADIUS.card}px`,
        sheet: `${RADIUS.sheet}px`,
        photo: `${RADIUS.photo}px`,
      },
    },
  },
};
