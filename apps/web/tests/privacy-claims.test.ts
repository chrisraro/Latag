import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Claim-regression guard for /privacy and /data: both pages once described
 * data practices that do not exist in the product.
 *
 * 1. Both claimed "anonymous usage counters" (items logged, active regions)
 *    were collected, with an in-app opt-out. There is no analytics/telemetry
 *    code anywhere in apps/mobile (grepped app/, lib/, components/, hooks/ —
 *    nothing) and Settings (apps/mobile/app/(tabs)/settings.tsx) has no such
 *    toggle. Both the collection and the control were fictional.
 * 2. Both claimed photos are served from a "Philippines-region CDN". Supabase
 *    offers no PH region, and nothing in this repo (next.config.ts's
 *    `remotePatterns: [{ hostname: "**.supabase.co" }]`, apps/mobile/lib/
 *    shop-api.ts, or any Supabase config) pins one.
 *
 * This test reads the real page sources (not a hardcoded copy of their text)
 * so it fails the moment either claim is reintroduced, rather than going
 * stale the way a copy-pasted string would.
 */

const ROOT = path.resolve(__dirname, "..");

const SURFACES = ["app/privacy/page.tsx", "app/data/page.tsx"] as const;

function read(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Analytics/telemetry claim regression guard", () => {
  const FORBIDDEN_PATTERNS: RegExp[] = [
    /anonymous usage counter/i,
    /anonymous counters?/i,
    /items logged/i,
    /active regions/i,
    /in-app opt-out/i,
    /opt-out/i,
    /turn this off in the app/i,
  ];

  for (const surface of SURFACES) {
    test(`${surface} does not claim usage analytics are collected or can be opted out of`, () => {
      const source = read(surface);
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(
          pattern.test(source),
          `${surface} matched forbidden pattern ${pattern} — there is no analytics/telemetry code anywhere ` +
            `in apps/mobile and Settings has no opt-out toggle, so this claim is fictional`,
        ).toBe(false);
      }
    });
  }
});

describe("Photo-hosting region claim regression guard", () => {
  const FORBIDDEN_PATTERNS: RegExp[] = [
    /philippines[\s-]?region/i,
    /\bph[\s-]?region\b/i,
    /region[\s-]?al cdn/i,
  ];

  for (const surface of SURFACES) {
    test(`${surface} does not claim a Philippines-region CDN`, () => {
      const source = read(surface);
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(
          pattern.test(source),
          `${surface} matched forbidden pattern ${pattern} — Supabase offers no PH region and nothing in ` +
            `this repo pins one, so this claim is unsupportable`,
        ).toBe(false);
      }
    });
  }
});
