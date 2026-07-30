import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { DESIGN_COLORS, RADIUS } from "@latag/tokens";
import { COLORS as MOBILE_THEME_COLORS } from "../../mobile/lib/theme";

const require = createRequire(import.meta.url);

const REPO_ROOT = path.resolve(__dirname, "../../..");
const DESIGN_MD_PATH = path.join(REPO_ROOT, "DESIGN.md");
const GLOBALS_CSS_PATH = path.join(REPO_ROOT, "apps/web/app/globals.css");
const MOBILE_TAILWIND_CONFIG_PATH = path.join(REPO_ROOT, "apps/mobile/tailwind.config.js");

/**
 * Parses DESIGN.md's color table directly from the markdown — NOT a
 * hardcoded second copy of the values. Matches rows shaped
 * `| `token` | `oklch(...)` | `#HEX` | role |` and ignores everything else
 * (the typography/spec tables have no `#HEX` column, so they never match).
 */
function parseDesignMdColorTable(markdown: string): Record<string, string> {
  const rowPattern = /^\|\s*`([a-z0-9-]+)`\s*\|\s*`[^`]*`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/gm;
  const table: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(markdown))) {
    table[match[1]] = match[2].toUpperCase();
  }
  return table;
}

/**
 * Parses the three documented radii out of the "Radii:" bullet in
 * DESIGN.md's Spacing/Shape/Touch section — again, parsed from the prose,
 * not re-typed as a second literal source.
 */
function parseDesignMdRadii(markdown: string): { card: number; sheet: number; photo: number } {
  const line = markdown.split(/\r?\n/).find((l) => l.includes("Radii:"));
  if (!line) throw new Error("DESIGN.md: could not find the 'Radii:' bullet");
  const card = /cards (\d+)px/.exec(line);
  const sheet = /modal sheets (\d+)px/.exec(line);
  const photo = /photo slots (\d+)px/.exec(line);
  if (!card || !sheet || !photo) {
    throw new Error(`DESIGN.md: could not parse card/sheet/photo radii from: ${line}`);
  }
  return { card: Number(card[1]), sheet: Number(sheet[1]), photo: Number(photo[1]) };
}

/**
 * Parses `--color-*` custom properties out of apps/web's `@theme` block.
 * Tailwind v4's CSS-first config cannot import a JS/TS value at build time
 * (see the comment in globals.css), so these are literal — this parser is
 * what keeps them honest against @latag/tokens and DESIGN.md.
 */
function parseGlobalsCssColors(css: string): Record<string, string> {
  const varPattern = /--color-([a-z0-9]+):\s*(#[0-9A-Fa-f]{6})\s*;/g;
  const vars: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = varPattern.exec(css))) {
    vars[match[1]] = match[2].toUpperCase();
  }
  return vars;
}

/** "ink-dim" -> "inkdim" (matches globals.css's/tailwind's hyphen-free custom-property naming). */
function slugToFlatKey(slug: string): string {
  return slug.replace(/-/g, "");
}

/** "ink-dim" -> "inkDim" (matches theme.ts's camelCase property naming). */
function slugToCamelKey(slug: string): string {
  return slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

const designMd = readFileSync(DESIGN_MD_PATH, "utf8");
const designMdColors = parseDesignMdColorTable(designMd);
const designMdRadii = parseDesignMdRadii(designMd);
const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf8");
const globalsCssColors = parseGlobalsCssColors(globalsCss);
const mobileTailwindConfig = require(MOBILE_TAILWIND_CONFIG_PATH) as {
  theme: { colors: Record<string, string>; extend: { borderRadius: Record<string, string> } };
};

describe("design token parity (DESIGN.md <-> @latag/tokens <-> apps/mobile <-> apps/web)", () => {
  test("DESIGN.md's color table has the 11 documented tokens", () => {
    expect(Object.keys(designMdColors).sort()).toEqual(
      [
        "acid",
        "acid-ink",
        "bg",
        "danger",
        "hairline",
        "ink",
        "ink-dim",
        "ink-faint",
        "sold",
        "surface-1",
        "surface-2",
      ].sort(),
    );
  });

  test.each(Object.entries(designMdColors))(
    "@latag/tokens DESIGN_COLORS.%s matches DESIGN.md",
    (slug, hex) => {
      expect(DESIGN_COLORS[slug as keyof typeof DESIGN_COLORS]?.toUpperCase()).toBe(hex);
    },
  );

  test.each(Object.entries(designMdColors))(
    "apps/mobile/lib/theme.ts COLORS.%s matches DESIGN.md",
    (slug, hex) => {
      const key = slugToCamelKey(slug) as keyof typeof MOBILE_THEME_COLORS;
      expect(MOBILE_THEME_COLORS[key]?.toUpperCase()).toBe(hex);
    },
  );

  test.each(Object.entries(designMdColors))(
    "apps/mobile/tailwind.config.js theme.colors.%s matches DESIGN.md",
    (slug, hex) => {
      const key = slugToFlatKey(slug);
      expect(mobileTailwindConfig.theme.colors[key]?.toUpperCase()).toBe(hex);
    },
  );

  test.each(Object.entries(designMdColors))(
    "apps/web/app/globals.css --color-%s matches DESIGN.md",
    (slug, hex) => {
      const key = slugToFlatKey(slug);
      expect(globalsCssColors[key]).toBe(hex);
    },
  );

  test("the undocumented sheet-handle color is named exactly once, in @latag/tokens", () => {
    expect(DESIGN_COLORS).not.toHaveProperty("handle");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tokens = require("@latag/tokens") as { handle: string };
    expect(tokens.handle).toBe("#3A3A3A");
    expect(mobileTailwindConfig.theme.colors.handle).toBe("#3A3A3A");
  });

  test("radii: DESIGN.md, @latag/tokens, and apps/mobile's tailwind config agree", () => {
    expect(RADIUS.card).toBe(designMdRadii.card);
    expect(RADIUS.sheet).toBe(designMdRadii.sheet);
    expect(RADIUS.photo).toBe(designMdRadii.photo);

    expect(mobileTailwindConfig.theme.extend.borderRadius.card).toBe(`${RADIUS.card}px`);
    expect(mobileTailwindConfig.theme.extend.borderRadius.sheet).toBe(`${RADIUS.sheet}px`);
    expect(mobileTailwindConfig.theme.extend.borderRadius.photo).toBe(`${RADIUS.photo}px`);
  });

  test("card radius is 14px, matching the app's ~30 existing rounded-[14px] call sites, not the pre-Wave-2 12px spec", () => {
    expect(RADIUS.card).toBe(14);
  });
});
