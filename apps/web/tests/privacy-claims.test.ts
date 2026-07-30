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

/**
 * Delete-retry-count claim regression guard: `MAX_ATTEMPTS = 5` in
 * apps/mobile/lib/shop-sync.ts caps the TOTAL number of attempts a queued
 * delete gets (see the "After five honest tries" comment and `drainQueue`,
 * which skips a row once `attempts >= MAX_ATTEMPTS`) — it is not 1 initial
 * attempt plus 5 retries. "attempted immediately and retried automatically up
 * to 5 times" reads as 1 + 5 = 6 total attempts, which is wrong by one.
 */
describe("Delete-retry-count claim regression guard", () => {
  const AMBIGUOUS_SIX_TOTAL: RegExp[] = [
    /attempted\s+immediately\s+and\s+(?:is\s+)?retried\s+automatically\s+up\s+to\s+5\s+times/i,
  ];
  const UNAMBIGUOUS_FIVE_TOTAL = /up\s+to\s+5\s+(?:times|attempts)\s+total/i;

  for (const surface of SURFACES) {
    test(`${surface} does not imply 6 total delete attempts (1 immediate + 5 retries)`, () => {
      const source = read(surface);
      for (const pattern of AMBIGUOUS_SIX_TOTAL) {
        expect(
          pattern.test(source),
          `${surface} matched ${pattern} — MAX_ATTEMPTS caps the TOTAL attempts at 5, not 5 retries on top of ` +
            `an initial try`,
        ).toBe(false);
      }
    });

    test(`${surface} states the 5-attempt cap unambiguously as a total`, () => {
      const source = read(surface);
      expect(
        UNAMBIGUOUS_FIVE_TOTAL.test(source),
        `${surface} should spell out that 5 is the TOTAL number of delete attempts, matching MAX_ATTEMPTS in ` +
          `apps/mobile/lib/shop-sync.ts`,
      ).toBe(true);
    });
  }
});

/**
 * Uploaded-field-list completeness guard: both pages claim to enumerate every
 * field a publish uploads. `toShopItemUpsert` (apps/mobile/lib/shop-sync.ts)
 * and `upsertShopItem` (apps/mobile/lib/shop-api.ts) also send the item's
 * public code, its shop display order, and an internal reference id used to
 * match future edits to the right row — none privacy-sensitive, but the list
 * claims exhaustiveness, so omitting them makes it false.
 */
describe("Uploaded-field-list completeness guard", () => {
  const REQUIRED_FIELD_MENTIONS: RegExp[] = [
    /(?:public|item'?s)\s+code/i,
    /(?:display|shop)\s+order/i,
    /internal\s+reference/i,
  ];

  for (const surface of SURFACES) {
    test(`${surface} lists the item code, display order, and internal reference id as uploaded`, () => {
      const source = read(surface);
      for (const pattern of REQUIRED_FIELD_MENTIONS) {
        expect(
          pattern.test(source),
          `${surface} is missing a mention matching ${pattern} — the uploaded-fields list must be accurate`,
        ).toBe(true);
      }
    });
  }
});
