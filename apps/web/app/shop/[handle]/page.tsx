import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShopWithItems } from "../../../lib/shop-queries";
import { shopUrl } from "../../../lib/inquiry";
import { ShopFooter, ShopNav } from "../StorefrontChrome";
import { ShopGrid } from "./ShopGrid";

/** Fresh within a minute of a seller publishing; cached for everyone else. */
export const revalidate = 60;

/** Nothing is prerendered at build time — shops are created after deploy. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const data = await getShopWithItems(handle);
  if (!data) return { title: "Shop not found" };

  const { shop, items } = data;
  const description =
    shop.bio?.trim() ||
    `${items.length} ${items.length === 1 ? "piece" : "pieces"} listed by ${shop.display_name} on Latag.`;

  return {
    title: shop.display_name,
    description,
    alternates: { canonical: `/shop/${shop.handle}` },
    openGraph: {
      title: shop.display_name,
      description,
      url: shopUrl(shop.handle),
      type: "website",
    },
  };
}

export default async function ShopPage({ params }: Props) {
  const { handle } = await params;
  const data = await getShopWithItems(handle);
  if (!data) notFound();

  const { shop, items } = data;
  const available = items.filter((i) => i.status === "available").length;
  const sold = items.length - available;

  return (
    <div className="overflow-x-hidden">
      <ShopNav handle={shop.handle} />

      <section className="mx-auto max-w-5xl px-5 pb-12 pt-14 md:pb-16 md:pt-20">
        <h1
          className="display-black line-clamp-3 text-balance uppercase leading-[0.95] tracking-tight"
          style={{ fontSize: "clamp(2rem, 4vw + 1rem, 3.25rem)" }}
        >
          {shop.display_name}
        </h1>
        {shop.bio?.trim() ? (
          <p className="mt-5 max-w-[54ch] text-[15px] leading-relaxed text-inkdim">{shop.bio}</p>
        ) : null}
        <p className="tnum mt-5 text-[13px] leading-[1.4] text-inkfaint">
          {available} available
          {sold > 0 ? ` · ${sold} sold` : ""}
        </p>
      </section>

      <section className="pb-20 md:pb-28">
        <ShopGrid handle={shop.handle} items={items} />
      </section>

      <ShopFooter />
    </div>
  );
}
