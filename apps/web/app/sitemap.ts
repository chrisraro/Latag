import type { MetadataRoute } from "next";
import { listStorefrontUrls } from "../lib/shop-queries";

/** Storefronts are created by sellers after deploy, so this can no longer be a
 *  build-time constant — it refreshes hourly. */
export const revalidate = 3600;

/**
 * Per-route last-modified dates. Wave 3 whole-wave review, M6: every
 * marketing route used to share one hardcoded date, which was wrong for
 * `/faq` (brand new this wave) and for `/`, `/privacy`, `/terms`, `/data`
 * (all edited July 30, 2026 — see each page's own "Last updated" text on
 * /privacy, /terms, /data, /faq). `/pro` wasn't touched this wave, so it
 * keeps the prior date.
 */
const MARKETING_LAST_MODIFIED: Record<string, Date> = {
  "": new Date("2026-07-30"),
  "/pro": new Date("2026-07-13"),
  "/privacy": new Date("2026-07-30"),
  "/terms": new Date("2026-07-30"),
  "/data": new Date("2026-07-30"),
  "/faq": new Date("2026-07-30"),
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://latag.vercel.app";

  const marketing = Object.entries(MARKETING_LAST_MODIFIED).map(([p, lastModified]) => ({
    url: `${base}${p}`,
    lastModified,
  }));

  const storefronts = (await listStorefrontUrls()).map((e) => ({
    url: `${base}${e.path}`,
    lastModified: e.lastModified,
  }));

  return [...marketing, ...storefronts];
}
