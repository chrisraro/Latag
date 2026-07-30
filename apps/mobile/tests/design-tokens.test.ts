import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RADIUS, handle } from "@latag/tokens";

/**
 * Wave 2 Task 1 (centralising colour/radius tokens into @latag/tokens)
 * shipped a change that redefined `RADIUS.card` from 12 to 14, on the claim
 * that the `rounded-card` Tailwind utility was dead — the implementer had
 * only grepped for the arbitrary form `rounded-[14px]`, never for
 * `rounded-card` itself. It was in fact live at 12 call sites across 7
 * files, so the change silently grew the corner radius by 2px on all of
 * them (AppToast, the Batches tab card list, all three Shop-tab cards,
 * shop/setup, item/[id]/index, session/[id]/export, session/[id]/index).
 *
 * This file makes that kind of claim checkable instead of assertable: it
 * inventories every real `rounded-*` utility call site under apps/mobile's
 * app/ and components/ directories, so a future "this class is dead" claim
 * fails a test rather than shipping silently. If you add or remove a
 * `rounded-card` call site, update the expected count below as a deliberate,
 * reviewable step — that friction is the point.
 */

const MOBILE_ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components"].map((d) => path.join(MOBILE_ROOT, d));
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Counts every occurrence of `utilityClass` as a whole Tailwind class token
 * (not a prefix match, so `rounded-card` doesn't also match a hypothetical
 * `rounded-card-lg`) across every source file under `dirs`.
 */
function countUtilityCallSites(utilityClass: string, dirs: string[]): number {
  const pattern = new RegExp(`(?<![\\w-])${utilityClass}(?![\\w-])`, "g");
  let count = 0;
  for (const dir of dirs) {
    for (const file of listSourceFiles(dir)) {
      const contents = readFileSync(file, "utf8");
      const matches = contents.match(pattern);
      if (matches) count += matches.length;
    }
  }
  return count;
}

const allSourceFiles = SCAN_DIRS.flatMap(listSourceFiles);

test("sanity: the scan actually finds source files (guards against a typo'd path silently returning zero)", () => {
  expect(allSourceFiles.length).toBeGreaterThan(30);
});

test("rounded-card is a live Tailwind utility — 12 real call sites, not dead code", () => {
  const count = countUtilityCallSites("rounded-card", SCAN_DIRS);
  expect(count).toBe(12);
});

test("RADIUS.card is 12, matching the rounded-card utility it generates in apps/mobile/tailwind.config.js", () => {
  expect(RADIUS.card).toBe(12);
});

/**
 * The five sheet-handle call sites (BrandPickerSheet, shop/setup,
 * session/edit, item/[id]/sold, session/new) used to hand-type
 * `bg-[#3A3A3A]` — a bare hex literal copy-pasted five times. They now use
 * the `bg-handle` token class instead (same value, zero visual change).
 * These assertions guard against a call site quietly reverting to the raw
 * literal, which would put the color out of sync with @latag/tokens again.
 */
test("no call site hand-types the sheet-handle hex literal anymore", () => {
  const count = countUtilityCallSites("bg-\\[#3A3A3A\\]", SCAN_DIRS);
  expect(count).toBe(0);
});

test("bg-handle is used at exactly the 5 known sheet-handle call sites", () => {
  const count = countUtilityCallSites("bg-handle", SCAN_DIRS);
  expect(count).toBe(5);
});

test("the handle token value hasn't drifted from what those 5 call sites used to hardcode", () => {
  expect(handle).toBe("#3A3A3A");
});
