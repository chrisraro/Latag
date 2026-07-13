# Product

## Register

product

## Users

Independent ukay-ukay / vintage clothing resellers in the Philippines (Naga City, Baguio, Metro Manila). They source stock in warehouses and basements with **no cell signal**, working through piles of garments for up to 6 hours at a time, phone in one hand, clothes in the other. They sell through Instagram drop posts. They are not tech workers; they are small-business operators whose margin lives or dies on fast, accurate logging and honest math.

## Product Purpose

Latag is an offline-first pocket ops tool: log a top in under 5 seconds one-handed, watch profit / capital-recovery math update live from the on-device database, and export ready-to-post IG captions with one tap. Success = a full sourcing session completed in airplane mode with zero typing in the item flow and numbers the seller trusts enough to make buy/skip decisions on the spot.

Two financial modes: **Selector** (per-item cost → profit) and **Bulto** (fixed bale cost → capital-recovery %).

## Brand Personality

**Warehouse console.** Pro equipment, not a social app. Three words: rugged, exact, fast. The interface should feel like a well-made tool — a label gun, a scale, a cash counter — that disappears into the task. Money is the hero of every screen.

## Anti-references

- Social/consumer app aesthetics: celebratory confetti, playful illustrations, rounded-bubbly friendliness (Instagram, Shopee vibes).
- Generic SaaS dashboard: hero-metric cards, gradient accents, card-grid monotony.
- Anything that requires two hands, precise taps, or reading small gray text in warehouse glare.

## Design Principles

1. **Thumb-first, glare-proof.** Every primary action reachable one-handed; contrast tuned for dim basements and harsh daylight both. Targets ≥ 48px.
2. **Zero typing in the flow.** Wheels, chips, and taps for all item data. Text entry exists only for session name/location and brand search.
3. **Money is the hero.** Peso figures are the largest, highest-contrast elements on any screen that has them. Tabular numerals everywhere numbers change.
4. **Felt, not watched.** Haptics confirm every input; motion is 150–250ms state feedback that masks DB writes — never choreography.
5. **OLED is a battery feature.** Pure `#000000` base is functional (6-hour sessions), not aesthetic.

## Accessibility & Inclusion

- One-handed operation is a hard requirement, not an enhancement.
- Contrast: ≥ 4.5:1 body text, money figures well above that; tested against pure black.
- Haptic + visual double-confirmation on all destructive and money-affecting actions.
- `prefers-reduced-motion`: all transitions fall back to instant/crossfade.
- Dark-only in MVP (deliberate; light theme is out of scope).
