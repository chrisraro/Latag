import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { PRO_MONTHLY, PRO_YEARLY } from "@latag/licensing";
import { PRO_PRICE_PHP, PRO_TRIAL_DAYS } from "../lib/structured-data";

/**
 * Wave 3, Task 5, item 2: `public/llms.txt` per llmstxt.org, summarising what
 * Latag is, who it serves, current pricing, and key routes. `app/robots.ts`
 * already allows `*` (including AI crawlers), so this file is reachable at
 * https://latag.vercel.app/llms.txt without any further robots change.
 */

const PATH = join(__dirname, "..", "public", "llms.txt");

describe("public/llms.txt", () => {
  test("exists", () => {
    expect(existsSync(PATH)).toBe(true);
  });

  const content = existsSync(PATH) ? readFileSync(PATH, "utf8") : "";

  test("has an H1 naming Latag", () => {
    expect(content).toMatch(/^#\s+Latag/m);
  });

  // Reads the real PRO_PRICE_PHP / PRO_TRIAL_DAYS rather than hardcoding a
  // second copy, so a SKU price change that isn't mirrored here fails this
  // test instead of shipping a stale llms.txt.
  test("states the real monthly and yearly prices", () => {
    expect(content).toContain(`₱${PRO_PRICE_PHP[PRO_MONTHLY]}/month`);
    expect(content).toContain(`₱${PRO_PRICE_PHP[PRO_YEARLY].toLocaleString("en-PH")}/year`);
  });

  test("states the real trial length", () => {
    expect(content).toContain(`${PRO_TRIAL_DAYS}-day free trial`);
  });

  test("does not assert a live iOS/App Store billing path", () => {
    expect(content.toLowerCase()).not.toMatch(/apple|app store/);
  });

  test("does not describe Pro as a one-time purchase", () => {
    expect(content.toLowerCase()).not.toMatch(/one-time|one time|pay once/);
  });

  test("links to the key routes", () => {
    for (const path of ["/", "/pro", "/faq", "/privacy", "/terms", "/data", "/account"]) {
      expect(content).toContain(`https://latag.vercel.app${path === "/" ? "/" : path}`);
    }
  });
});
