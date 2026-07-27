import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Storefront photos live in the public `shop-photos` Supabase bucket.
     * Scoped to that one public read path so the optimizer can never be aimed
     * at arbitrary URLs, and left as a hostname wildcard so a project move
     * doesn't silently break every seller's grid.
     *
     * `search` is deliberately absent, not `""`. `""` means "empty query string
     * only", which would reject the `?v=<updated_at>` cache-buster every photo
     * URL now carries (see `versionedPhotoUrl`) with a 400 — i.e. every image on
     * every storefront. Omitting it allows any query; the `pathname` lock is
     * what keeps the optimizer pointed at our own bucket.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/shop-photos/**",
      },
    ],
  },
};

export default nextConfig;
