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

One family, two voices: **Archivo** (Google Fonts, variable — weight 100–900 × width 62–125%). A grotesque designed for headlines that stays highly readable in UI; free license; ships in Expo via bundled static instances.

Why Archivo: streetwear brand type splits between geometric caps (Supreme/Nike's Futura) and default grotesques (the Helvetica of every second label). Archivo's **Expanded Bold/Black** delivers that athletic jersey-lettering voice for display, while normal width is a workhorse text grotesque — one family, zero pairing risk, maximum legibility.

**Display voice** — Archivo Expanded (width 118–125%), weight 800–900. Used for: screen titles, headline money/percent figures, primary & secondary buttons (uppercase, +0.03em tracking), badges. Never for body or dense rows.

**Text voice** — Archivo normal width. Weights 400–800 per scale below.

| Token | Size/Line | Weight / Width | Use |
|---|---|---|---|
| `display-money` | 34/38 | 900 / 125% | Dashboard headline figures |
| `title` | 21/28 | 800 / 118% | Screen titles |
| `heading` | 17/24 | 600 / 100% | Card titles, row brands |
| `body` | 15/22 | 400 / 100% | Default |
| `label` | 11.5/16 | 600 / 100%, +0.08em, uppercase | Field labels |
| `caption` | 12/16 | 400 / 100% | Meta, timestamps |
| `wheel-value` | 28/32 | 800 / 100% | Active wheel value |
| `button` | 16/— | 800 / 125%, +0.03em, uppercase | Primary/secondary actions |

- **`font-variant-numeric: tabular-nums` (feature `tnum`) on every money figure, measurement, and wheel** — digits must not jitter as values change.
- Peso format: `₱1,250` — symbol at 0.7em of the figure, no decimals (whole-peso market).
- Expo implementation: bundle static TTFs (`Archivo-Regular/Medium/SemiBold/Bold`, `ArchivoExpanded-ExtraBold/Black`) via `expo-font`; React Native's variable-font axis support is unreliable, so ship instances, not the variable file.

## Iconography

**Phosphor Icons, Bold weight** — one library, one weight, everywhere. MIT license; `phosphor-react-native` in the Expo build.

Why Phosphor Bold: its chunky geometric strokes sit at the same visual weight as Archivo Expanded 800 — icons and type read as one voice. It offers 9,000+ glyphs in six weights (so Fill is available for rare emphasis states without changing library), and it isn't Lucide — the template/AI default that makes products look identical.

Rules:
- Weight is **Bold** for all UI icons. **Fill** allowed only for selected-state toggles (e.g. filled camera slot indicator). Never mix in other libraries.
- Icons inherit text color (`currentColor`) — they follow the same color rules as the text they sit beside; acid only when the text is acid.
- Sizes: 16px inline with body/buttons, 18–20px in touch targets, 12–14px in badges/captions.
- Emoji are reserved exclusively for the IG caption output (👕 📏 ✨ 💸 📍) — they are product data (what buyers see on Instagram), not UI.
- Core vocabulary: `plus` (create), `caret-left/right/down` (nav/disclosure), `check` (confirm/selected), `camera` (photo capture), `magnifying-glass` (search), `pencil-simple` (edit), `trash` (delete), `clipboard-text` (copy/export), `airplane-tilt` (offline indicator, mockups only).
- **Brand-mark exception:** the Google sign-in button uses Google's official four-color "G" on a 26px white circular tile (per Google identity guidelines) — never a single-color icon-pack substitute.

## Spacing, Shape, Touch

- 4pt grid: 4 / 8 / 12 / 16 / 24 / 32.
- Rhythm rule: tight within groups (8–12px: label→control, icon→text), generous between groups (16–24px: section→section, content→primary action). Never uniform spacing everywhere.
- Screen gutter: 16px. Card padding: 16px.
- Safe areas: sheets get ≥28px bottom padding (home indicator); content respects status-bar top inset.
- Radii: chips & buttons **pill**; cards 12px; modal sheets 20px top corners; photo slots 10px.
- Touch targets ≥ 48×48px. Primary action buttons: full-width, 56px tall, bottom-anchored in thumb zone.
- Z-scale: `base(0) < sticky-header(10) < sheet-backdrop(20) < sheet(30) < toast(40)`.

## Components

- **Chip** — pill, 44px tall (≥48px hit area with row padding), `surface-2` + hairline at rest; selected = `acid` bg + `acid-ink` text + haptic light. One group = one selection.
- **Scroll wheel** — horizontal detent strip; center value in `wheel-value` + acid underline tick; neighbors dim + scale 0.8; haptic tick per detent. Unit label (`in`, `₱`) in `ink-faint` beside value. Item width adapts to the longest formatted label (5+ digit prices never overlap). **Money wheels** may enable a custom-amount escape hatch: the unit label renders acid + underlined and opens a number-pad sheet; the entered value injects into the track and snaps into place. Measurement wheels never get the escape hatch.
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

## Build Notes (React Native / Expo)

From the React Native best-practices ruleset — binding for the build phase:

- **Lists:** FlashList (not FlatList/ScrollView-map) for item grids and session lists; memoized item components; stable callbacks; no inline style objects in items.
- **Images:** `expo-image` everywhere (thumbnails, carousel) with `recyclingKey` in lists; thumbnails render the compressed local file, never full-res.
- **Animations:** Reanimated on transform/opacity only (SAVE flash, sheet slide, counter roll); wheel detents via `useDerivedValue`; `Gesture.Tap`/`Gesture.Pan` from gesture-handler for wheels and chips.
- **Pressables:** `Pressable` (never TouchableOpacity) with `hitSlop` to guarantee ≥48px targets where visuals are smaller.
- **Navigation:** Expo Router native stack; New Session / Mark Sold as native modal presentation (`presentation: 'modal'`).
- **Safe areas:** `react-native-safe-area-context` insets on every screen; bottom-anchored primary buttons sit above the home indicator.
- **Fonts:** Archivo static TTFs via config plugin (`expo-font` plugin in app.json), not runtime `loadAsync` — zero flash of fallback type.
