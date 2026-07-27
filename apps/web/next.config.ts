import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Storefront photos live in the public `shop-photos` Supabase bucket.
     * Scoped to that one public read path so the optimizer can never be aimed
     * at arbitrary URLs, and left as a hostname wildcard so a project move
     * doesn't silently break every seller's grid.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/shop-photos/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
