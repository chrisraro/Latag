import type { MetadataRoute } from "next";
import { listStorefrontUrls } from "../lib/shop-queries";

/** Storefronts are created by sellers after deploy, so this can no longer be a
 *  build-time constant — it refreshes hourly. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://latag.vercel.app";

  const marketing = ["", "/pro", "/privacy", "/terms", "/data"].map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date("2026-07-13"),
  }));

  const storefronts = (await listStorefrontUrls()).map((e) => ({
    url: `${base}${e.path}`,
    lastModified: e.lastModified,
  }));

  return [...marketing, ...storefronts];
}
