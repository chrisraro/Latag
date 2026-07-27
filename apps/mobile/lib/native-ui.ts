/**
 * Master switch for every `@expo/ui` Compose view in the app.
 *
 * ## Why this exists
 *
 * On 2026-07-27, OTA 019fa3f7 shipped Material 3's `HorizontalFloatingToolbar`
 * as the tab bar. On the owner's device the app crashed on launch and kept
 * crashing: the tab bar renders on every screen, so there was no route that
 * avoided it. Recovery took a republished update, because `checkAutomatically`
 * is `NEVER` — the app only fetches an update from our own JS, which the crash
 * kept killing before the download finished. An update that crashes on launch
 * is very nearly unrecallable by the device it is crashing.
 *
 * The component was not unguarded. It had a capability check (does the export
 * exist?) and a React error boundary. Both were useless, and the reason is the
 * lesson worth keeping:
 *
 *   A crash inside Compose is a native exception on the Android UI thread.
 *   It never becomes a JS exception, so `getDerivedStateFromError` is not in
 *   its call stack and no boundary can catch it. Our guards only ever
 *   protected against a native view that was MISSING. They do nothing about
 *   one that is BROKEN, and "broken" is not something JS can detect.
 *
 * ## The rule
 *
 * No Compose view ships over the air, ever. An OTA is the one delivery channel
 * with no rollback the user can reach themselves. Native components go out in
 * a NATIVE build, where a bad one is caught before release and where the store
 * rollout can be halted.
 *
 * ## Turning it on
 *
 * 1. Flip this to `true` in a development build and read logcat on a real
 *    device (`adb logcat *:E`) while exercising every screen that hosts one.
 * 2. Ship it in a native build. Never in the OTA that first renders it.
 * 3. Leave it `false` on `master` until step 2 is done — `tests/native-ui-gate.test.ts`
 *    enforces that, and the enforcement is the point.
 *
 * The fallbacks are not a consolation prize. `FloatingTabBar` and the `Chip`
 * row are the controls this app shipped with, they carry the Warehouse Console
 * tokens that stock Material cannot, and they are what the user sees today.
 */
export const NATIVE_UI_ENABLED = false;

/**
 * The same rule, applied to Reanimated's worklet runtime.
 *
 * Reanimated 4.5 and react-native-worklets are autolinked into the v1.1.0
 * binary, but no JS on `master` imports either — checked with
 * `git grep -l react-native-reanimated master -- apps/mobile`, which matches
 * package.json and nothing else. NativeWind's runtime only `require`s it from
 * inside functions that run when a class carries a transition, so it has never
 * been reached. Phase G's entrance animations and swipe rows would therefore
 * be the first code ever to create a shared value or run a worklet on that
 * phone, and they would arrive by OTA.
 *
 * The guarded `require` in `lib/motion.ts` does not cover this. It catches a
 * module that is MISSING; a worklet runtime that is misconfigured fails on the
 * UI thread, which is the uncatchable case that took the app down on
 * 2026-07-27. And the blast radius is launch itself: entrance animations wrap
 * Home's recent strip and every Inventory row, and Home is the boot screen.
 *
 * So the motion and swipe layers ship in a NATIVE build, verified against
 * logcat on a real device, alongside the Compose components above. With this
 * off, rows render at rest and swipe rows are ordinary rows — every action
 * they expose is still reachable from the item screen.
 */
export const NATIVE_ANIMATION_ENABLED = false;
