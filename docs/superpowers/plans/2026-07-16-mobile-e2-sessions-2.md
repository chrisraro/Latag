# E2 — Sessions 2.0: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map location pinning on sessions, scheduled sessions with native alarm reminders, and a two-tab sessions screen — all JS on the v1.1.0 runway, ships OTA.

**Architecture:** Additive sessions migration (location + schedule columns); pure logic modules (`lib/schedule.ts` reminder math, `lib/geocode.ts` Nominatim URL/parsing) TDD'd; side-effect modules (`lib/notifications.ts`) wrap expo-notifications behind a small interface; UI composes `LocationPicker` (MapLibre + OpenFreeMap) and a Wheel-based `DateTimeSheet` (no native date-picker dep) into new/edit session sheets; sessions screen splits into Sessions | Scheduled tabs.

**Tech Stack:** @maplibre/maplibre-react-native 11 (installed), expo-location/notifications (installed), OpenFreeMap `https://tiles.openfreemap.org/styles/liberty`, Nominatim `https://nominatim.openstreetmap.org/search`.

## Global Constraints

- Spec §4 of `docs/superpowers/specs/2026-07-15-latag-phase-e-catalog-sessions-media-design.md` is law.
- **Offline-first**: network now sanctioned ONLY in: supabase/license/auth files (existing), `lib/updates.ts`, and NEW `lib/geocode.ts` + MapLibre tile fetches inside `components/LocationPicker.tsx`. Geocode/tiles degrade silently; session creation NEVER blocks on network. Notifications are fully local.
- JS-only: no package.json/app.json changes (runway v1.1.0 already has all natives).
- E1 migration lesson: after `drizzle-kit generate`, READ the SQL — additive ALTERs expected; any table rebuild must be verified column-by-column. Migration-integrity test extends `tests/schema.test.ts` (journal-driven, seeds old rows incl. photos child).
- Nominatim policy: debounce ≥1s, header `User-Agent: latag-app`, attribution "Search © OpenStreetMap" visible in picker. OpenFreeMap needs no key/attribution beyond OSM credit (show "© OpenStreetMap" on map).
- Wheel component untouched; reuse with per-field ranges. Toasts/haptics/double-tap-guard patterns as existing. Design: Warehouse Console tokens, screen px-5, rows px-3 py-3.5, sheets per existing chrome, 44px targets, a11y labels on icon-only pressables.
- Gates per task from apps/mobile: `pnpm test` green (169+ growing) · `npx tsc --noEmit` 0 · `npx expo export --platform android` ok (delete dist/). Commit per task with the plan's message; do NOT push.
- Branch: `feat/phase-e2-sessions`. Repo root path has a space — quote.

---

### Task 1: Sessions schema — location + schedule columns

**Files:** Modify `apps/mobile/db/schema.ts`; generate `apps/mobile/drizzle/0002_*.sql`; extend `apps/mobile/tests/schema.test.ts`

**Interfaces:** `sessions` += `locationName: text("location_name")`, `lat: real("lat")`, `lng: real("lng")`, `scheduledAt: integer("scheduled_at", { mode: "timestamp" })`, `reminderOffsets: text("reminder_offsets")` (JSON array of minutes, e.g. `"[0,60,1440]"`), `reminderNotificationIds: text("reminder_notification_ids")` (JSON array of strings) — ALL nullable. Existing `location` text column stays (legacy free-text; new code reads/writes `locationName`).

- [ ] Failing integrity test: old-shape session row (through 0000+0001) survives 0002 with new cols null; scheduled session with `scheduledAt` + offsets inserts; RED → schema edit → `npx drizzle-kit generate` → READ SQL (expect pure `ALTER TABLE sessions ADD COLUMN` × 6; no rebuild) → GREEN; suite green.
- [ ] Commit: `feat(mobile): sessions schema — location pin + schedule columns`

### Task 2: Schedule logic — lib/schedule.ts (TDD)

**Files:** Create `apps/mobile/lib/schedule.ts`, `apps/mobile/tests/schedule.test.ts`

**Interfaces:**
```ts
export const REMINDER_PRESETS: { minutes: number; label: string }[]; // 0 "At time" · 30 "30 min before" · 60 "1 hr before" · 1440 "1 day before"
export function reminderTimes(scheduledAt: Date, offsetsMinutes: number[], now: Date): Date[]; // scheduledAt - offset, strictly future (> now), sorted asc, deduped
export function parseOffsets(json: string | null): number[];        // tolerant: null/invalid -> []
export function formatCountdown(scheduledAt: Date, now: Date): string; // "in 3d 4h" / "in 2h 15m" / "in 45m" / "now" (past => "now")
export function scheduleSortKey(s: { scheduledAt: Date | null }): number; // soonest-first ordering
export function formatScheduleStamp(d: Date): string;               // "Sat · Jul 18 · 6:30 AM" (en-PH friendly, no seconds)
```
- [ ] Failing tests: offset math incl. past-filtering (offset 1440 on a 2h-away session → excluded), dedupe, countdown buckets (>48h → days+hours; <1h → minutes; past → "now"), parseOffsets garbage tolerance, stamp format (fixed Date fixture, assert exact string). RED → implement (pure; `Intl`/manual formatting — Hermes-safe: build stamp manually from getDay/getMonth arrays, NOT Intl) → GREEN.
- [ ] Commit: `feat(mobile): schedule logic — reminder math, countdowns, presets`

### Task 3: Notifications module — lib/notifications.ts

**Files:** Create `apps/mobile/lib/notifications.ts`, `apps/mobile/tests/notifications.test.ts`; Modify `apps/mobile/app/_layout.tsx`

**Interfaces:**
```ts
export async function ensureNotifPermission(): Promise<boolean>;                 // request; never throws; false on deny
export async function ensureAlarmChannel(): Promise<void>;                        // Android channel "session-reminders": MAX importance, sound "alarm.wav" (asset name "alarm"), vibration [0,400,200,400], bypassDnd false
export async function scheduleSessionReminders(s: { id: string; name: string; scheduledAt: Date; offsets: number[] }, now?: Date): Promise<string[]>; // returns notification ids; body copy: title `⏰ ${name}` body offset===0 ? "Bale opens now — start your session" : "Bale opens " + countdown-style lead; data: { url: `latag://session/${id}` }; iOS sound "alarm.wav", interruptionLevel "timeSensitive"
export async function cancelReminders(ids: string[] | null | undefined): Promise<void>; // tolerant
export function parseNotifIds(json: string | null): string[];
```
- [ ] TDD the PURE parts (parseNotifIds, the exported `reminderBodyFor(offsetMinutes)` copy helper) in jest with expo-notifications mocked in tests/helpers/setup.ts (mock pattern like expo-crypto: `jest.mock("expo-notifications", () => ({ scheduleNotificationAsync: jest.fn(async () => "id-" + Math.random()), cancelScheduledNotificationAsync: jest.fn(), setNotificationChannelAsync: jest.fn(), requestPermissionsAsync: jest.fn(async () => ({ granted: true })), setNotificationHandler: jest.fn(), addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })) }))`). Test scheduleSessionReminders maps reminderTimes → N schedule calls with channelId + data.url, returns ids.
- [ ] `_layout.tsx`: module-level `Notifications.setNotificationHandler` (show alert+sound in foreground); one effect (gated on `migrated`): `ensureAlarmChannel()`; response listener → `router.push(response.notification.request.content.data.url)` guarded try/catch; cleanup on unmount. Existing effects untouched.
- [ ] Commit: `feat(mobile): session reminder notifications — alarm channel, scheduling, deep-link tap`

### Task 4: Geocode + LocationPicker component

**Files:** Create `apps/mobile/lib/geocode.ts`, `apps/mobile/tests/geocode.test.ts`, `apps/mobile/components/LocationPicker.tsx`

**Interfaces:**
```ts
// lib/geocode.ts (network-sanctioned)
export function buildSearchUrl(q: string): string; // nominatim /search?q=&format=json&limit=5&countrycodes=ph
export function parseResults(json: unknown): { name: string; lat: number; lng: number }[]; // display_name shortened to first 3 comma segments; tolerant of garbage -> []
export async function searchPlaces(q: string): Promise<{ name: string; lat: number; lng: number }[]>; // fetch with UA header, 6s timeout, never throws -> []
```
`<LocationPicker value={{name,lat,lng}|null} onChange={(v|null)=>} />` — collapsed state: a `.field`-style row (MapPin icon + name or "Pin a location — optional") opening a full-height Modal: MapLibre MapView (styleURL OpenFreeMap liberty, `attributionEnabled` or manual "© OpenStreetMap" caption 11px inkfaint), center pin (fixed center marker; map drags under it — simplest drag-to-pin), search field on top (debounced 1s → searchPlaces → results list overlays; tap = camera fly + set name), locate-me circle button (expo-location `getCurrentPositionAsync` after `requestForegroundPermissionsAsync`; denial → error toast "Location permission needed — search or drag instead"), footer: name TextInput (editable; auto-filled from search pick, else "Pinned location") + "Use this location" PrimaryButton + "Remove pin" secondary when value set. Offline: map may render blank; search fails silently to empty list + subtle "Offline — drag the map or type a name" hint; picker still returns coords/name.
- [ ] TDD geocode URL/parse/timeout (mock global.fetch in test). Icon additions to components/Icon.tsx allowed: `MapPin, CrosshairSimple, MagnifyingGlass` (MagnifyingGlass exists).
- [ ] Commit: `feat(mobile): location picker — maplibre + openfreemap, nominatim search, locate-me`

### Task 5: DateTimeSheet + new/edit session integration

**Files:** Create `apps/mobile/components/DateTimeSheet.tsx`; Modify `apps/mobile/app/session/new.tsx`; Create `apps/mobile/app/session/edit.tsx` (modal route, `?id=`), register in `_layout.tsx` Stack as modal; Modify `apps/mobile/lib/repo.ts` (+ tests)

**Interfaces:**
- `<DateTimeSheet visible initial onConfirm={(d: Date)=>} onClose />`: three Wheels — Day (labels from `formatScheduleStamp` date part for today..+30d), Hour (1–12), Minute (00–55 step 5) + AM/PM chip pair; confirm builds the Date. Wheel reuse only.
- repo: `addSession` gains optional `{ locationName, lat, lng, scheduledAt, reminderOffsets }`; new `updateSession(db, id, patch)` + `startScheduledSession(db, id)` (clears scheduledAt/reminderOffsets/reminderNotificationIds, keeps location; returns old notif ids for cancellation); TDD all three.
- new.tsx: below existing fields — `LocationPicker`; then "SCHEDULE FOR LATER · OPTIONAL" FieldLabel + collapsed row → DateTimeSheet; when scheduled: show stamp + reminder preset Chips (multi-select, default "30 min before"); save path: if scheduledAt set → `ensureNotifPermission()` (deny → toast "Reminders off — enable notifications in system settings", still save) → addSession → scheduleSessionReminders → store ids via updateSession → toast "Scheduled for {stamp}" → back (no dashboard push). Unscheduled path unchanged.
- edit.tsx: name/location/schedule editable for any session; on schedule change → cancel old ids, reschedule; delete-session action here too (cancels reminders; existing delete cascade semantics).
- [ ] Commit: `feat(mobile): schedule + pin sessions — datetime sheet, edit sheet, reminder wiring`

### Task 6: Sessions screen — two tabs + scheduled cards + Start now

**Files:** Modify `apps/mobile/app/index.tsx`

- [ ] Segmented tabs under header (`.seg` style, like console departments): **Sessions | Scheduled**; badge count on Scheduled when > 0. Live query splits: `scheduledAt IS NULL` (existing list, unchanged) vs `scheduledAt IS NOT NULL` sorted by `scheduleSortKey`.
- [ ] Scheduled card (scard chrome): name + countdown (`formatCountdown`, acid, tabular) top row; `formatScheduleStamp` + MapPin+locationName line 12 inkfaint; foot: reminder summary ("3 reminders") + actions: **Start now** (acid pill chip → `startScheduledSession` + `cancelReminders` + haptic + toast "Session started" → push dashboard), Edit (chip → edit sheet), overdue state (scheduledAt past → countdown "now", card border-acid).
- [ ] Empty scheduled tab: ghostcard "No scheduled sessions — plan your next bale run from New Session".
- [ ] Session cards (live tab) gain MapPin+locationName line when set. FAB/new-session unchanged.
- [ ] Commit: `feat(mobile): sessions screen — Sessions | Scheduled tabs, countdown cards, start now`

### Task 7: E2 gate

**Files:** `docs/qa/mobile-mvp-checklist.md` (+Phase E2 section: pin via search/drag/locate incl. permission-deny path; offline pinning; schedule → lock phone → alarm fires with sound → tap opens session; edit reschedules; start-now cancels pending reminders; two-tab behavior; overdue card), spec §4 SHIPPED mark, ledger. Full gates. Commit `chore(mobile): E2 QA + spec update — E2 complete`. Coordinator then: whole-phase review → fixes → merge → OTA publish (env-var + bundle-grep procedure; also grep "openfreemap" present).

## Self-Review Notes
Spec §4 coverage: columns→T1; presets/sort/countdown→T2; channel/alarm/deep-link/cancel-reschedule→T3+T5; map/search/drag/locate/offline/attribution→T4; two tabs/Start now/soonest-first→T6; "scheduled holds no items until started" → scheduled cards have no dashboard nav except Start now (T6). Type consistency: schedule.ts names consumed by T3/T5/T6; repo additions consumed by T5/T6. No placeholders: copy strings, channel config, URL params, wheel compositions specified. ✓
