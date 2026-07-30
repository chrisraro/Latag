import { readFileSync } from "fs";
import { join } from "path";

/**
 * The 2026-07-30 "don't sell what's free" regression.
 *
 * The paywall's Pro feature list listed "IG drop export" (never gated —
 * app/session/[id]/export.tsx has no entitlement check, and is reachable from
 * home.tsx and session/[id]/index.tsx) and "Works offline, always" (also
 * never gated — the app is offline-first for free users too, advertised in
 * welcome.tsx, onboarding.tsx and Settings' "Offline-first" row). The
 * subtitle on the IG bullet was separately false: ig-share.ts saves photos to
 * an album, copies the caption, and opens Instagram — it never posts a story.
 *
 * These tests are the standing rule that came out of it: every bullet on the
 * paywall must map to a real, cited gate in code, and re-adding one of the
 * removed claims must fail loudly.
 */

const MOBILE_ROOT = join(__dirname, "..");
const PAYWALL_PATH = join(MOBILE_ROOT, "app/pro/paywall.tsx");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Pulls `{ title, subtitle }` pairs out of the FEATURES array literal. */
function extractFeatures(src: string): { title: string; subtitle: string }[] {
  const start = src.indexOf("const FEATURES");
  if (start === -1) throw new Error("FEATURES array not found in paywall.tsx");
  const end = src.indexOf("\n];", start);
  const block = src.slice(start, end);
  const entries: { title: string; subtitle: string }[] = [];
  const re = /title:\s*"([^"]+)"\s*,\s*\n\s*subtitle:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    entries.push({ title: m[1], subtitle: m[2] });
  }
  return entries;
}

// Every remaining bullet must correspond to a real entitlement check.
// Adding a new bullet without adding an entry (and citing a real gate) here
// is the failure mode this test exists to catch.
const KNOWN_GATES: Record<string, { file: string; pattern: RegExp }> = {
  "Your own shop page": {
    file: join(MOBILE_ROOT, "hooks/useShopViewModel.ts"),
    pattern: /pro = entRows\?\.\[0\]\?\.pro === true/,
  },
  "Buyer-ready inquiries": {
    // Buyer inquiries only exist once a shop page is published, so they
    // share the shop tab's Pro gate.
    file: join(MOBILE_ROOT, "app", "(tabs)", "shop.tsx"),
    pattern: /if \(!vm\.pro\)/,
  },
};

describe("paywall Pro feature list", () => {
  const src = read(PAYWALL_PATH);
  const features = extractFeatures(src);

  test("the extractor actually finds the feature list (sanity check)", () => {
    expect(features.length).toBeGreaterThan(0);
  });

  test("never sells IG drop export as Pro — app/session/[id]/export.tsx has no gate", () => {
    const titles = features.map((f) => f.title);
    expect(titles).not.toContain("IG drop export");
  });

  test("never sells offline support as Pro — the app is offline-first for free users too", () => {
    const titles = features.map((f) => f.title);
    expect(titles).not.toContain("Works offline, always");
  });

  test("never claims IG export posts to Instagram stories — ig-share.ts only saves, copies, and opens the app", () => {
    expect(src).not.toMatch(/instagram stor(y|ies)/i);
  });

  test("every listed Pro feature has a cited, still-present gate", () => {
    for (const feature of features) {
      const gate = KNOWN_GATES[feature.title];
      // Fails loudly for any bullet added without auditing + citing its gate.
      expect(gate).toBeDefined();
      if (gate) {
        expect(read(gate.file)).toMatch(gate.pattern);
      }
    }
  });

  test("the feature list is exactly the audited set", () => {
    // Forces a conscious update to this file (and a fresh citation above)
    // whenever FEATURES changes, instead of a silent drift back to selling
    // free features.
    expect(features.map((f) => f.title)).toEqual(["Your own shop page", "Buyer-ready inquiries"]);
  });
});
