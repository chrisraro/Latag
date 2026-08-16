# Latag Mobile

Offline-first inventory app for Philippine ukay-ukay resellers. Expo SDK 57 /
React Native 0.86 / expo-router / NativeWind, with local SQLite via
`drizzle-orm/expo-sqlite`.

Read `../../PRODUCT.md` and `../../DESIGN.md` before changing UI, and
`AGENTS.md` in this directory before writing any Expo code.

## Running it

This is a pnpm workspace — install from the repo root, not from here.

```bash
pnpm install          # repo root
pnpm mobile           # or: pnpm -C apps/mobile start
```

**Expo Go will not work.** The app depends on native modules that are not in
the Expo Go client (SQLite, camera, media library, location, notifications,
MapLibre, gesture-handler). Use a development build or an internal-distribution
build from EAS.

## Gates

Run from the repo root; both must be clean before anything ships:

```bash
pnpm typecheck        # tsc --noEmit
pnpm test             # jest
```

## Shipping

JS-only changes go out over the air on the `preview` channel:

```bash
npx expo export --platform android     # verify the bundle graph resolves
npx eas-cli update --branch preview --platform android --skip-bundler --input-dir dist
```

Two rules that are not optional, both learned from incidents:

- **`runtimeVersion` in `app.json` is pinned to a literal** and must match the
  installed binary, which is not the same as `version`. Check `eas build:list`
  before changing it — a mismatch means the update is silently never delivered.
- **No `@expo/ui` Compose view and no Reanimated worklet ships over the air.**
  Both kill switches in `lib/native-ui.ts` stay `false`; `tests/native-ui-gate.test.ts`
  enforces it. Native UI goes out in an `eas build`, verified against
  `adb logcat *:E` on a real device.

Anything that changes native dependencies (`package.json`, `app.json`, config
plugins, permissions) needs an `eas build` — it cannot reach devices over OTA.
