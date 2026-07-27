import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { itemPhotoUrls, photoVersion, versionedPhotoUrl } from "../lib/shop-format";

/**
 * Storefront photos are written to deterministic object paths with
 * `upsert: true`, so a re-shot photo replaces the bytes behind a URL that never
 * changes — the Supabase CDN and Next's image optimizer would both keep serving
 * the old shot for their full TTL. The row's `updated_at` is the only signal
 * that the bytes may have moved, so it becomes the cache key.
 */

const URL = "https://abc.supabase.co/storage/v1/object/public/shop-photos/u1/i1/0.jpg";
const AT = "2026-07-27T10:00:00.000Z";

describe("versionedPhotoUrl", () => {
  it("appends a version derived from updated_at", () => {
    expect(versionedPhotoUrl(URL, AT)).toBe(`${URL}?v=${photoVersion(AT)}`);
  });

  it("is stable for an unchanged row so the CDN still caches", () => {
    expect(versionedPhotoUrl(URL, AT)).toBe(versionedPhotoUrl(URL, AT));
  });

  it("changes when the row is republished", () => {
    expect(versionedPhotoUrl(URL, AT)).not.toBe(
      versionedPhotoUrl(URL, "2026-07-27T10:00:01.000Z")
    );
  });

  it("keeps an existing query string intact", () => {
    expect(versionedPhotoUrl(`${URL}?width=800`, AT)).toBe(
      `${URL}?width=800&v=${photoVersion(AT)}`
    );
  });

  it("leaves the URL alone when updated_at is missing or unparseable", () => {
    expect(versionedPhotoUrl(URL, null)).toBe(URL);
    expect(versionedPhotoUrl(URL, "")).toBe(URL);
    expect(versionedPhotoUrl(URL, "not a date")).toBe(URL);
  });

  it("never invents a URL out of an empty one", () => {
    expect(versionedPhotoUrl("", AT)).toBe("");
  });
});

describe("itemPhotoUrls", () => {
  it("versions every photo and preserves order", () => {
    const v = photoVersion(AT);
    expect(itemPhotoUrls({ photo_urls: [`${URL}`, "https://x/2.jpg"], updated_at: AT })).toEqual([
      `${URL}?v=${v}`,
      `https://x/2.jpg?v=${v}`,
    ]);
  });

  it("tolerates a row with no photos", () => {
    expect(itemPhotoUrls({ photo_urls: [], updated_at: AT })).toEqual([]);
  });
});

describe("next/image remote pattern", () => {
  const pattern = nextConfig.images?.remotePatterns?.[0] as
    | { hostname?: string; pathname?: string; search?: string }
    | undefined;

  it("does not pin search to empty, which would 400 every versioned URL", () => {
    expect(pattern?.search).toBeUndefined();
  });

  it("still scopes the optimizer to the public shop-photos path", () => {
    expect(pattern?.hostname).toBe("**.supabase.co");
    expect(pattern?.pathname).toBe("/storage/v1/object/public/shop-photos/**");
  });
});
