import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { NATIVE_ANIMATION_ENABLED, NATIVE_UI_ENABLED } from "../lib/native-ui";

/**
 * The 2026-07-27 crash-loop regression.
 *
 * OTA 019fa3f7 shipped Material 3's `HorizontalFloatingToolbar`. On a real
 * device the Compose view threw on the UI thread and took the process with it,
 * every launch, with no way back except a republished update. The component
 * had a capability check AND a React error boundary; neither helped, because a
 * native exception never becomes a JS one — `getDerivedStateFromError` is not
 * in that call stack. Our guards only ever protected against a view that was
 * MISSING, never one that was BROKEN.
 *
 * These tests are the standing rule that came out of it. They are deliberately
 * source-level: the thing being prevented cannot be reproduced in Jest, where
 * there is no Compose runtime to crash.
 */

const MOBILE_ROOT = join(__dirname, "..");
const SCANNED_DIRS = ["app", "components", "lib"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCE_FILES = SCANNED_DIRS.flatMap((d) => walk(join(MOBILE_ROOT, d)));

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** `import ... from "@expo/ui"`. Deliberately does NOT match the type-only
 *  `typeof import("@expo/ui/jetpack-compose")`, which is erased at compile
 *  time and reaches no native code. */
const STATIC_IMPORT = /^\s*import\s[^;]*?\sfrom\s*["']@expo\/ui/m;

/** A runtime reach into the package: `require("@expo/ui...")`. */
const RUNTIME_REQUIRE = /require\(\s*["']@expo\/ui/;

/** `import ... from "react-native-reanimated" | "react-native-worklets" |
 *  "react-native-gesture-handler/ReanimatedSwipeable"`. Mirrors STATIC_IMPORT
 *  above: a static import of any of these evaluates the worklet runtime at
 *  module scope, during route registration — before any try/catch or error
 *  boundary exists to guard it. That is a WORSE case than the require() form
 *  below, not a lesser one, so it needs its own dedicated check rather than
 *  falling through a require()-only regex untouched. */
const REANIMATED_STATIC_IMPORT =
  /^\s*import\s[^;]*?\sfrom\s*["'](?:react-native-reanimated|react-native-worklets|react-native-gesture-handler\/ReanimatedSwipeable)["']/m;

/** A runtime reach into any of the three: `require("react-native-reanimated")`,
 *  `require("react-native-worklets")`, or the Reanimated-backed Swipeable. */
const REANIMATED_RUNTIME_REQUIRE =
  /require\(\s*["'](?:react-native-reanimated|react-native-worklets|react-native-gesture-handler\/ReanimatedSwipeable)["']/;

describe("@expo/ui may never be reached unguarded", () => {
  test("no source file imports @expo/ui at module scope", () => {
    // A static import runs `requireNativeView` the moment the module is
    // evaluated. If the native view is absent that throws during route
    // registration, before any boundary exists to catch it — the screen is
    // simply gone. Every reach must be a require() inside a try/catch.
    const offenders = SOURCE_FILES.filter((f) => STATIC_IMPORT.test(read(f)));
    expect(offenders.map((f) => f.replace(MOBILE_ROOT, ""))).toEqual([]);
  });

  test("every file that requires @expo/ui consults the kill switch", () => {
    const reaching = SOURCE_FILES.filter((f) => RUNTIME_REQUIRE.test(read(f)));
    // The guard is worthless if a new component quietly adds its own resolver.
    expect(reaching.length).toBeGreaterThan(0);

    const ungated = reaching.filter((f) => !read(f).includes("NATIVE_UI_ENABLED"));
    expect(ungated.map((f) => f.replace(MOBILE_ROOT, ""))).toEqual([]);
  });

  test("no source file imports react-native-reanimated, react-native-worklets, or ReanimatedSwipeable at module scope", () => {
    // The Reanimated equivalent of the @expo/ui static-import test above. A
    // static `import { useSharedValue } from "react-native-reanimated"` would
    // sail straight through a require()-only gate untouched, and it is the
    // WORSE failure mode of the two: it creates the worklet runtime the
    // instant the module is evaluated, during route registration, with no
    // try/catch and no error boundary anywhere in that call stack.
    const offenders = SOURCE_FILES.filter((f) => REANIMATED_STATIC_IMPORT.test(read(f)));
    expect(offenders.map((f) => f.replace(MOBILE_ROOT, ""))).toEqual([]);
  });

  test("every file that requires reanimated consults the animation switch", () => {
    // Reanimated's worklet runtime is the same hazard as Compose: it fails on
    // the UI thread, where nothing in JS can catch it. `master` ships no JS
    // importing it, so anything here would be its first run on the device.
    const reaching = SOURCE_FILES.filter((f) => REANIMATED_RUNTIME_REQUIRE.test(read(f)));
    expect(reaching.length).toBeGreaterThan(0);

    const ungated = reaching.filter((f) => !read(f).includes("NATIVE_ANIMATION_ENABLED"));
    expect(ungated.map((f) => f.replace(MOBILE_ROOT, ""))).toEqual([]);
  });

  test("the animation switch is off until a native build proves the runtime", () => {
    expect(NATIVE_ANIMATION_ENABLED).toBe(false);
  });

  test("the kill switch is off, so no Compose view can ship over the air", () => {
    // Turning this on is a NATIVE-build decision, verified against logcat on a
    // real device. It must never be flipped in the same update that first
    // renders a component — an OTA that crashes on launch cannot be recalled
    // by the device that is crashing.
    expect(NATIVE_UI_ENABLED).toBe(false);
  });
});
