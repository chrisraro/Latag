# E3 — Media & Sharing: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Per-session gallery albums, one-tap photo export, permissions onboarding pane, one-tap IG share — JS-only on the v1.1.0 runway, ships OTA.

**Architecture:** `lib/albums.ts` wraps expo-media-library behind small never-throw functions; UI buttons on item detail + export screen; onboarding gains a permissions pane; `lib/ig-share.ts` composes albums+clipboard+Linking. **Spec §5 deviation (documented in Task 4):** no share-intent module is installed (expo-sharing would need a rebuild), so Share-to-IG = save images to album → copy caption → open Instagram app (photos are first in IG's recents picker). A future runway may add expo-sharing for a true multi-image intent.

## Global Constraints

- Spec §5 + this deviation. JS-only: NO package.json/app.json changes. Offline-first: albums/clipboard/Linking are local; NO new fetch.
- expo-media-library (~57.0.2, installed): use `requestPermissionsAsync(false)`, `createAssetAsync(uri)`, `getAlbumAsync(name)`, `createAlbumAsync(name, asset, false)`, `addAssetsToAlbumAsync(assets, album, false)` — verify exact signatures against installed types before writing. Mock in tests/helpers/setup.ts (pattern like expo-notifications).
- Album name: `albumNameFor(sessionName)` → `Latag · ${sessionName.trim()}` truncated to 60 chars; fallback `Latag` when blank.
- All failures → honest error toasts; permission denial copy: "Photos permission needed — enable it in system settings". Success toast: `Saved N photo(s) to "{album}"`.
- Design per house rules (tokens, 44px, a11y, sheet/row chrome). Gates per task from apps/mobile: pnpm test green (248+), tsc 0, expo export android ok (delete dist/). Commit per task, no push. Branch `feat/phase-e3-media`. Repo path has a space — quote.

### Task 1: lib/albums.ts + item/export save buttons

Create `lib/albums.ts` + `tests/albums.test.ts` (TDD pure parts: albumNameFor incl. trim/truncate/fallback; savePhotosToAlbum orchestration with mocked media-library: permission denied → {ok:false,reason:"permission"}; N uris → createAsset×N, album created once then reused, returns {ok:true,count,album}).
```ts
export function albumNameFor(sessionName: string | null | undefined): string;
export async function savePhotosToAlbum(uris: string[], sessionName: string | null): Promise<{ ok: true; count: number; album: string } | { ok: false; reason: "permission" | "empty" | "error" }>;
```
UI: `app/item/[id]/index.tsx` — under the action buttons, a SecondaryButton row `icon="Download"` label "Save photos" (all of this item's photo localUris, busy guard, toasts). `app/session/[id]/export.tsx` — header-right or below CTA: "Save all images" (all photos of SELECTED items; falls back to all items' photos when none selected — match screen's selection semantics; busy guard, toasts).
Commit: `feat(mobile): gallery albums — save item/session photos to Latag session albums`

### Task 2: Onboarding permissions pane

`app/onboarding.tsx`: PANES 2→3; pane 3 "Permissions" — title "Latag asks only when needed", three obcard-style rows (Icon tile + title + body + right-side "Allow" chip → real OS prompt, chip flips to acid "Granted ✓" state on grant, stays tappable on deny): Photos (`MediaLibrary.requestPermissionsAsync(false)`) "Save listing photos to your gallery" · Notifications (`ensureNotifPermission()` from lib/notifications) "Session reminders that ring like an alarm" · Location (`Location.requestForegroundPermissionsAsync()`) "Pin sessions on the map". Footer: "All optional — Latag asks again only when a feature needs it." Existing panes/dots/Skip/finish flow intact (Skip stays top-right; "Start logging" moves to pane 3).
Commit: `feat(mobile): onboarding permissions pane — photos, notifications, location`

### Task 3: Share to IG

Create `lib/ig-share.ts` + `tests/ig-share.test.ts` (TDD with mocks):
```ts
export async function shareToInstagram(args: { uris: string[]; caption: string; sessionName: string | null }): Promise<{ ok: boolean; step: "saved-opened" | "saved-only" | "permission" | "empty" }>;
// savePhotosToAlbum → if !ok return matching step; Clipboard.setStringAsync(caption) (expo-clipboard, installed);
// Linking.canOpenURL("instagram://app") ? openURL that : openURL("https://www.instagram.com") — openURL failures → "saved-only"
```
UI: export screen — PrimaryButton becomes "Share to IG" `icon="InstagramLogo"` (add to Icon.tsx) doing shareToInstagram(selected items' photos, current caption text); keep existing "Copy caption" as secondary. Item detail — small "Share to IG" secondary next to Save photos (single item caption via formatCaption([item])). Toasts: saved-opened → `Photos saved + caption copied — paste it in your IG post`; saved-only → `Photos saved + caption copied — open Instagram to post`; permission/empty per Task 1 copy. In-app helper text (11.5 inkfaint) under the export CTA: "IG doesn't allow direct multi-photo posting from apps — your photos land in the gallery first, caption's on your clipboard."
Spec: append deviation note to §5 (share-intent → album+clipboard+open flow; future runway may add expo-sharing).
Commit: `feat(mobile): one-tap Share to IG — album save, caption clipboard, app launch`

### Task 4: E3 gate

QA checklist "Phase E3" section (album appears in gallery per session; save-photos counts; permission deny paths; onboarding pane grants; IG share: photos land, caption pastes, IG opens; fresh-install onboarding shows 3 panes); spec §5 SHIPPED mark; ledger. Full gates. Commit `chore(mobile): E3 QA + spec update — E3 complete`. Coordinator: review → fixes → merge → OTA (env-var + bundle greps: URL + "instagram").

## Self-Review
§5 albums→T1, onboarding→T2, IG→T3 (+deviation), toasts/copy specified, types consistent (albumNameFor/savePhotosToAlbum consumed by T3). No placeholders. ✓
