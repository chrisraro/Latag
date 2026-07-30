import { describe, expect, test, vi } from "vitest";

/**
 * Wave 3 Task 3, item 5: verify robots.ts and sitemap.ts actually cover
 * every public route (including dynamic shop routes) and that nothing public
 * is accidentally noindexed.
 */

let storefrontUrls: { path: string; lastModified: Date }[] = [];

vi.mock("../lib/shop-queries", () => ({
  listStorefrontUrls: async () => storefrontUrls,
}));

describe("robots.ts", () => {
  test("allows crawling and points at the sitemap", async () => {
    const { default: robots } = await import("../app/robots");
    const result = robots();
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe("https://latag.vercel.app/sitemap.xml");
  });

  test("does not disallow any public marketing or shop route", async () => {
    const { default: robots } = await import("../app/robots");
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    for (const rule of rules) {
      const disallow = (rule as { disallow?: string | string[] }).disallow;
      if (!disallow) continue;
      const list = Array.isArray(disallow) ? disallow : [disallow];
      for (const path of ["/", "/pro", "/privacy", "/terms", "/data", "/shop"]) {
        expect(list).not.toContain(path);
      }
    }
  });
});

describe("sitemap.ts", () => {
  test("includes every static marketing/legal route", async () => {
    storefrontUrls = [];
    const { default: sitemap } = await import("../app/sitemap");
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    for (const path of ["", "/pro", "/privacy", "/terms", "/data"]) {
      expect(urls).toContain(`https://latag.vercel.app${path}`);
    }
  });

  test("includes dynamic shop and item routes from listStorefrontUrls", async () => {
    storefrontUrls = [
      { path: "/shop/thriftlord", lastModified: new Date("2026-07-01") },
      { path: "/shop/thriftlord/LT-AAAAA", lastModified: new Date("2026-07-02") },
    ];
    const { default: sitemap } = await import("../app/sitemap");
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://latag.vercel.app/shop/thriftlord");
    expect(urls).toContain("https://latag.vercel.app/shop/thriftlord/LT-AAAAA");
  });
});
