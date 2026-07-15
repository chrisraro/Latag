# Latag Phase E — Full Ukay Catalog, Sessions 2.0, Media & Sharing

**Date:** 2026-07-15 · **Status:** Approved · **Depends on:** Phases A–D shipped (OTA pipeline live)

## 1. Goal & decomposition

Expand Latag from tops-only to the full ukay scene, in three sub-phases with one native rebuild between E1 and E2:

- **E1 — Full Ukay Catalog** (pure JS → ships OTA): departments/types for all garments + footwear/bags/accessories, per-category spec fields, PH thrift brand database, separate item name vs brand.
- **Native runway**: one config task adds ALL new native modules (@maplibre/maplibre-react-native, expo-location, expo-notifications, expo-media-library), version → 1.1.0, ONE `eas build` + user reinstall. Everything after ships OTA.
- **E2 — Sessions 2.0**: map location pinning, scheduled sessions + reminders/alarm, two-tab sessions screen.
- **E3 — Media & Sharing**: per-session gallery albums, one-tap image export, permissions onboarding pane, one-tap IG share with media.

User decisions: order E1→runway→E2→E3; specs = 2 key wheels + "More specs" expander; brand seed ~400–600 curated.

## 2. E1 — Full Ukay Catalog (SHIPPED 2026-07-16)

### Taxonomy (department → type)

| Department | Types (chips) | Key specs (wheels) | More specs (expander) |
|---|---|---|---|
| Tops | Tee, Polo, Longsleeve, Jersey, Crewneck, Sweater, Hoodie, Jacket | PTP · Length | Sleeve |
| Bottoms | Jeans, Trousers, Cargo, Shorts, Skirt | Waist · Inseam | Rise, Leg opening |
| Dresses | Dress, Jumpsuit | PTP · Length | Waist |
| Footwear | Sneakers, Boots, Sandals, Leather | US size · Insole cm | Width label (D/2E…) |
| Bags | Backpack, Shoulder, Tote, Sling, Duffel | Width · Height | Depth, Strap drop |
| Accessories | Cap, Belt, Scarf, Beanie, Watch, Eyewear | — (one-size) | Freeform size note |

All measurements inches except insole (cm) and shoe size (US, half sizes). Wheels reuse the existing Wheel component with per-spec ranges/steps (e.g., waist 24–46 step 1; insole 20–32 step 0.5; US size 4–14 step 0.5).

### Data model (additive SQLite migration; existing rows auto-migrate)

- `items` += `department TEXT NOT NULL DEFAULT 'tops'`, `name TEXT` (nullable — optional item name, never mixed with brand), and nullable measurement columns: `waistInches, inseamInches, riseInches, legOpeningInches, sleeveInches, shoeSizeUs, insoleCm, widthInches, heightInches, depthInches, strapDropInches, sizeNote TEXT`. Existing `ptpInches/lengthInches` unchanged (Tops/Dresses).
- Existing items: department 'tops', name NULL. Zero data loss.
- `user_brands` table: `id, name (unique collation nocase), createdAt`.
- Validation: an item stores only its department's specs; repo layer nulls the rest.

### Brands

- Seed: `apps/mobile/data/brands.json` — ~400–600 entries `{ name, tier?: "core"|"common" }`, researched from the PH ukay/thrift reselling scene (streetwear, sportswear, outdoor, denim/workwear, Japanese select/surplus labels, designer). Bundled = offline; updated via OTA. Research uses web tooling during planning; the list is a reviewable artifact.
- Brand picker (Rapid Console): recent-brand chips stay (zero-typing path); tapping the brand field opens a search sheet — typeahead over recents ∪ user_brands ∪ seed (ranked in that order); no match → "Add ‘X’ as a brand" creates a user brand (local, suggested forever).
- `items.brand` stays denormalized TEXT (offline-simple); the picker is a suggestion layer, not a foreign key.

### Surfaces updated

Rapid Console (department segment → type chips → adaptive wheels → More specs expander; name field optional, under brand), item detail KV (per-department spec rows; Brand and Name as separate rows), dashboard/list rows + captions ("Brand · Name" when name present), IG caption spec line per department (e.g., `W32 · L30` for bottoms, `US 9.5 · 25.5cm` for footwear). Sold/export flows unchanged otherwise.

Deviation (2026-07-16): tops caption spec segment unified to the cross-department mid-dot form (`PTP 21" · L 27"`), replacing the blueprint's `PTP: 21" | L: 27"` — owner to veto via OTA if unwanted.

## 3. Native runway

- Add: `@maplibre/maplibre-react-native`, `expo-location`, `expo-notifications` (+ alarm sound asset + Android channel config), `expo-media-library`. All config-plugin work in app.json; permissions strings honest and minimal.
- `version` → 1.1.0 (runtimeVersion policy appVersion ⇒ new OTA lane; 1.0.0 installs keep receiving nothing new — acceptable, single-user fleet today).
- One `eas build --profile preview` + user reinstall. Gate: all suites, tsc, export, on-device smoke.

## 4. E2 — Sessions 2.0

### Location pinning

- Map: MapLibre + **OpenFreeMap** vector tiles (free, keyless, production-permitted). Geocoding search: **Nominatim** (debounced ≥1s, `latag` UA, attribution shown). My-location: expo-location foreground permission, one-tap pin.
- `sessions` += `locationName TEXT`, `lat REAL`, `lng REAL` (all nullable). Pin via search / drag / locate in new-session and a new edit-session sheet. Offline degradation: tiles blank → name typing + GPS pin still work; never blocks session creation.
- Session cards + dashboard show location name (pin icon).

### Scheduled sessions + reminders

- `sessions` += `scheduledAt INTEGER` (nullable), `reminderOffsets TEXT` (JSON array of minutes, e.g. `[0,60,1440]`), `startedAt` semantics unchanged for live sessions.
- Sessions screen: two tabs — **Sessions | Scheduled**. Scheduled tab sorts soonest-first; card = name, countdown, date/time, location; actions: Start now (converts to live, cancels pending reminders), edit, delete.
- Reminders: expo-notifications **local scheduled** notifications; presets At time / 30 min / 1 hr / 1 day before (multi-select). Android: dedicated high-priority channel `session-reminders` with bundled alarm sound + vibration; iOS: custom sound, time-sensitive interruption level. Tap → deep-link to the session. Reminders rescheduled on edit, cancelled on delete/start. Works offline and with the app killed.
- The scheduled→live conversion is the ONLY path between tabs; a scheduled session holds no items until started.

## 5. E3 — Media & Sharing

- **Albums**: expo-media-library; on first save, album `Latag · <session name>` is created; item screen gets one-tap **Save photos** (all of that item's images), export screen gets **Save all images** (whole drop). Toast confirms count + album name. Photos remain also in the app's private store (source of truth); albums are user-facing copies.
- **Permissions onboarding**: onboarding gains pane 3 "Permissions" — cards for Photos, Notifications, Location, each with an Allow button triggering the real OS prompt; skippable; every feature also re-asks contextually at first use (best practice; onboarding is preview, not gate).
- **IG share**: one **Share to IG** button on export (and item detail): caption auto-copied + images handed to Instagram's composer via the native share intent (multi-image). Constraint (documented in-app copy): Instagram exposes no public API for third-party multi-photo feed publishing without a business account + uploading photos to public servers — which would violate "photos never leave this phone." The share-intent flow is the legitimate maximum: IG opens with media attached, user pastes the caption (already on clipboard) and posts.

## 6. Cross-cutting

- **Offline-first invariant**: unchanged for inventory. New network surfaces (tiles, geocoding) live in sanctioned map modules, degrade silently, never block. Notifications/media/albums are fully local.
- **Free tier**: all Phase E features available to Free; the 20-log lifetime limit is the only gate (unchanged).
- **Testing**: TDD for all logic (taxonomy/spec mapping, caption rendering per department, brand ranking/merge, reminder offset math, schedule sorting, album naming); device QA checklist gains E sections.
- **UI/UX**: impeccable standards — same Warehouse Console language, 8pt rhythm, 44px targets, honest copy.

## 7. Out of scope (unchanged backlog)

Custom SMTP, payments, domain, Google OAuth, CSV export, telemetry, in-app feature requests.
