# Latag Design System — "Warehouse Console"

Status: **draft** — locked when the MVP mockups are approved.
Register: product (dark-only, OLED, thumb-first mobile).

## Theme

Single theme: OLED dark. Pure black base is a battery feature for 6-hour sourcing sessions, not an aesthetic. No light theme in MVP. Color strategy: **Restrained** — neutrals + one acid accent reserved for money-positive numbers, progress, and the primary action.

## Color

All colors OKLCH-first; hex fallbacks for NativeWind config.

| Token | OKLCH | Hex | Role |
|---|---|---|---|
| `bg` | `oklch(0 0 0)` | `#000000` | App background (OLED) |
| `surface-1` | `oklch(0.17 0 0)` | `#111111` | Cards, sheets |
| `surface-2` | `oklch(0.21 0 0)` | `#1A1A1A` | Elevated: chips at rest, wheel tracks |
| `hairline` | `oklch(0.27 0 0)` | `#262626` | 1px borders (no shadows on dark) |
| `ink` | `oklch(0.96 0 0)` | `#F2F2F2` | Primary text |
| `ink-dim` | `oklch(0.75 0 0)` | `#ADADAD` | Secondary text (≥ 7:1 on black) |
| `ink-faint` | `oklch(0.62 0 0)` | `#8A8A8A` | Tertiary/labels (≥ 4.6:1 on black) |
| `acid` | `oklch(0.90 0.21 122)` | `#B8F135` | Accent: money-positive, progress, SAVE, selection |
| `acid-ink` | `oklch(0.15 0.03 122)` | `#141A05` | Text on acid surfaces |
| `danger` | `oklch(0.66 0.21 30)` | `#FF5A3C` | Destructive, negative money, errors |
| `sold` | `oklch(0.62 0 0)` | `#8A8A8A` | Sold badges — resolved, not celebratory |

Rules:
- Acid never decorates. It marks money-positive values, active selection, progress fill, and the single primary action per screen.
- Negative realized profit renders in `danger`.
- No shadows; elevation is surface step + hairline border.

## Typography

One family: system sans (`SF Pro` / `Roboto` via system-ui stack). No display font.

| Token | Size/Line | Weight | Use |
|---|---|---|---|
| `display-money` | 34/38 | 700 | Dashboard headline figures |
| `title` | 22/28 | 700 | Screen titles |
| `heading` | 17/24 | 600 | Card titles, section heads |
| `body` | 15/22 | 400 | Default |
| `label` | 13/18 | 500 | Field labels, chip text |
| `caption` | 12/16 | 400 | Meta, timestamps |
| `wheel-value` | 28/32 | 700 | Active wheel value |

- **`font-variant-numeric: tabular-nums` on every money figure, measurement, and wheel** — digits must not jitter as values change.
- Peso format: `₱1,250` — symbol at 0.7em of the figure, no decimals (whole-peso market).

## Spacing, Shape, Touch

- 4pt grid: 4 / 8 / 12 / 16 / 24 / 32.
- Screen gutter: 16px. Card padding: 16px.
- Radii: chips & buttons **pill**; cards 12px; modal sheets 20px top corners; photo slots 10px.
- Touch targets ≥ 48×48px. Primary action buttons: full-width, 56px tall, bottom-anchored in thumb zone.
- Z-scale: `base(0) < sticky-header(10) < sheet-backdrop(20) < sheet(30) < toast(40)`.

## Components

- **Chip** — pill, 40px tall (48px hit area), `surface-2` + hairline at rest; selected = `acid` bg + `acid-ink` text + haptic light. One group = one selection.
- **Scroll wheel** — horizontal detent strip; center value in `wheel-value` + acid underline tick; neighbors dim + scale 0.8; haptic tick per detent. Unit label (`in`, `₱`) in `ink-faint` beside value.
- **Primary button** — full-width pill, acid bg, `acid-ink` bold label, pressed = scale 0.97 + haptic medium. One per screen.
- **Destructive button** — `danger` outline style; confirm dialog always.
- **Photo slot** — 10px-radius square, dashed hairline + type label (F/B/Tag/Flaw) when empty; thumbnail + label overlay when filled.
- **Progress bar (Bulto)** — 12px track `surface-2`; realized fill in solid acid; projected marker as hollow acid tick on the track; % figures in tabular nums.
- **Item row/tile** — 64px thumbnail (or placeholder glyph), brand `heading`, category+size `caption`, price right-aligned `heading` tabular; sold = `sold` badge + dimmed thumbnail.
- **Badge** — 12px caps-free label pill: `SOLD` in `sold`, mode badges (`SELECTOR` / `BULTO`) in hairline outline.
- **Toast** — bottom, above primary button, `surface-2`, 2.5s, slides 8px + fade.
- **Empty states** — teach the flow: "No items yet — hit + and log your first find" with the + rendered as the actual button style.

Every interactive component ships default / pressed / selected / disabled states. Skeletons over spinners.

## Motion

- 150–250ms, `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint). No bounce.
- Motion = state feedback only: SAVE flash (acid sweep 200ms), counter increment roll, sheet slide-up, toast. No page-load choreography.
- Every animation has a `prefers-reduced-motion` fallback: instant or crossfade.
- Haptics vocabulary (expo-haptics): `light` = chip select / wheel detent; `medium` = SAVE, mark sold; `error` buzz = failed write, delete confirm.
