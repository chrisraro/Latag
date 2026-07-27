import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHOP_HEADER_COLUMNS,
  SHOP_ITEM_COLUMNS,
  SHOP_SITEMAP_COLUMNS,
  columnList,
} from "../lib/shop-columns";

/**
 * The anon column grant in migration 0005 and the column lists the web selects
 * are one contract split across two files. If they drift the storefront 403s in
 * production and nowhere else, so this test reads the real SQL rather than a
 * copy of it.
 */

const MIGRATION = readFileSync(
  join(__dirname, "..", "..", "..", "supabase", "migrations", "0005_shop_public_columns.sql"),
  "utf8"
);

function grantedShopColumns(): string[] {
  const match = MIGRATION.match(
    /grant\s+select\s*\(([^)]*)\)\s*on\s+public\.shops\s+to\s+anon/i
  );
  if (!match) throw new Error("0005 must grant column-level select on public.shops to anon");
  return match[1]
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

describe("migration 0005 anon grant", () => {
  it("drops the table-wide select that leaked every column", () => {
    expect(MIGRATION).toMatch(/revoke\s+select\s+on\s+public\.shops\s+from\s+anon/i);
  });

  it("never hands an anonymous buyer the owner's auth.users id", () => {
    expect(grantedShopColumns()).not.toContain("user_id");
  });

  it("withholds columns no buyer surface reads", () => {
    expect(grantedShopColumns()).not.toContain("created_at");
  });

  it("still grants the columns the RLS policies evaluate", () => {
    // `public shops` reads is_published; `public shop items` reads both.
    expect(grantedShopColumns()).toEqual(expect.arrayContaining(["is_published", "show_sold"]));
  });

  it("covers every column the web actually selects from shops", () => {
    const granted = grantedShopColumns();
    for (const column of [...SHOP_HEADER_COLUMNS, ...SHOP_SITEMAP_COLUMNS]) {
      expect(granted).toContain(column);
    }
  });
});

describe("web column lists", () => {
  it("asks for no shop column anon cannot read", () => {
    const granted = grantedShopColumns();
    expect([...SHOP_HEADER_COLUMNS].every((c) => granted.includes(c))).toBe(true);
  });

  it("reads updated_at on items so photo URLs can carry a version", () => {
    expect(SHOP_ITEM_COLUMNS).toContain("updated_at");
  });

  it("renders a PostgREST select string", () => {
    expect(columnList(["a", "b"] as const)).toBe("a, b");
  });
});
