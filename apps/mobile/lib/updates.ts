export type UpdatePhase = "dev-skip" | "up-to-date" | "ready" | "error";

type Deps = {
  isDev: boolean;
  check: () => Promise<{ isAvailable: boolean }>;
  fetch: () => Promise<{ isNew: boolean }>;
};

/**
 * OTA check/fetch as a pure-ish state machine so the decision logic is
 * unit-testable without the native module. Never throws: offline/CDN
 * failures resolve to "error" and the caller decides whether to surface it
 * (silent on launch, toast on manual check).
 */
export async function runUpdateCheck({ isDev, check, fetch }: Deps): Promise<UpdatePhase> {
  if (isDev) return "dev-skip";
  try {
    const { isAvailable } = await check();
    if (!isAvailable) return "up-to-date";
    // A resolved fetch means a newer bundle is on disk regardless of isNew —
    // checkForUpdateAsync already compared against the RUNNING bundle, so
    // isNew:false just means it was downloaded earlier and is still pending
    // a restart. Either way the honest answer is "ready".
    await fetch();
    return "ready";
  } catch {
    return "error";
  }
}

/** "v1.0.0 · a1b2c3d4" — short update id, or "embedded" for the built-in bundle. */
export function versionLabel(version: string, updateId: string | null | undefined): string {
  return `v${version} · ${updateId ? updateId.slice(0, 8) : "embedded"}`;
}
