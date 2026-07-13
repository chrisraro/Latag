import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://latag.ph";
  return ["", "/pro", "/privacy", "/terms", "/data"].map((p) => ({ url: `${base}${p}`, lastModified: new Date("2026-07-13") }));
}
