import appConfig from "../app.json";
import { versionLabel } from "../lib/updates";

const expo = appConfig.expo as {
  version: string;
  runtimeVersion: string | { policy: string };
  updates?: { url?: string };
};

/**
 * `runtimeVersion` is the OTA compatibility key: an update is only delivered to
 * an installed binary whose runtime version matches exactly.
 *
 * With `policy: "appVersion"` the two are welded together, so bumping the
 * user-facing version silently orphans every installed build from all future
 * OTA updates. That happened once already and had to be reverted (7b129b3).
 * Pinning runtimeVersion to a literal lets the displayed version track
 * releases while OTA compatibility stays an explicit, deliberate decision.
 */
describe("app.json version configuration", () => {
  test("runtimeVersion is pinned to a literal, never derived from appVersion", () => {
    expect(typeof expo.runtimeVersion).toBe("string");
  });

  /**
   * Verified against the EAS build record, not against a commit message:
   * the installed Android build is `2ae15b7b` (2026-07-16), Runtime Version
   * 1.1.0, and every delivered update on the `preview` channel is 1.1.0.
   *
   * An earlier commit reverted this to 1.0.0 "to match the embedded build",
   * which was the *previous* binary — that mismatch orphaned the device from
   * every subsequent OTA. Re-check `eas build:list` before ever changing it.
   */
  test("runtimeVersion matches the runtime of the installed native build", () => {
    // Bump this ONLY together with a new native build (eas build), never for
    // a JS-only OTA — see .superpowers/sdd/progress.md.
    expect(expo.runtimeVersion).toBe("1.1.0");
  });

  test("the user-facing version is a valid semver triple", () => {
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("the user-facing version has moved past the initial release", () => {
    expect(expo.version).not.toBe("1.0.0");
  });

  /**
   * The display version may run ahead of the runtime — JS-only releases ship
   * without a new binary. What must never happen is the reverse: a runtime
   * ahead of any build that exists, which silently stops OTA delivery.
   */
  test("runtimeVersion never runs ahead of the user-facing version", () => {
    const parse = (v: string) => v.split(".").map(Number);
    const [rMaj, rMin, rPatch] = parse(expo.runtimeVersion as string);
    const [vMaj, vMin, vPatch] = parse(expo.version);
    expect([rMaj, rMin, rPatch] <= [vMaj, vMin, vPatch]).toBe(true);
  });

  test("an OTA update channel is configured", () => {
    expect(expo.updates?.url).toBeTruthy();
  });
});

describe("versionLabel", () => {
  test("reports the embedded bundle when no update is running", () => {
    expect(versionLabel("1.1.0", null)).toBe("v1.1.0 · embedded");
  });

  test("reports a short update id when running an OTA bundle", () => {
    expect(versionLabel("1.1.0", "019fa3f7-dead-beef")).toBe("v1.1.0 · 019fa3f7");
  });

  test("labels the version currently declared in app.json", () => {
    expect(versionLabel(expo.version, null)).toBe(`v${expo.version} · embedded`);
  });
});
