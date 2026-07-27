import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { inquiryMessage, inquirySubject, itemUrl } from "../../../../lib/inquiry";
import {
  departmentLabel,
  formatPeso,
  itemPhotoUrls,
  itemTitle,
  specEntries,
  type ShopItem,
} from "../../../../lib/shop-format";
import { getShop, getShopItem } from "../../../../lib/shop-queries";
import { ShopFooter, ShopNav } from "../../StorefrontChrome";
import { InquiryButtons } from "./InquiryButtons";

export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ handle: string; item: string }> };

async function load(handle: string, code: string) {
  const shop = await getShop(handle);
  if (!shop) return null;
  const item = await getShopItem(shop.id, code);
  if (!item) return null;
  return { shop, item };
}

function summary(item: ShopItem): string {
  return `${item.condition} · ${formatPeso(item.price)} · ${departmentLabel(item.department)}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, item: code } = await params;
  const data = await load(handle, code);
  if (!data) return { title: "Item not found" };

  const title = itemTitle(data.item);
  const description = summary(data.item);
  return {
    title,
    description,
    alternates: { canonical: `/shop/${data.shop.handle}/${data.item.code}` },
    openGraph: {
      title,
      description,
      url: itemUrl(data.shop.handle, data.item.code),
      type: "website",
    },
  };
}

export default async function ItemPage({ params }: Props) {
  const { handle, item: code } = await params;
  const data = await load(handle, code);
  if (!data) notFound();

  const { shop, item } = data;
  const title = itemTitle(item);
  const specs = specEntries(item.specs);
  // Versioned against the row's updated_at — see `versionedPhotoUrl`.
  const photos = itemPhotoUrls(item);
  const url = itemUrl(shop.handle, item.code);
  const message = inquiryMessage({
    code: item.code,
    brand: item.brand,
    name: item.name,
    condition: item.condition,
    price: item.price,
    url,
  });

  return (
    <div className="overflow-x-hidden">
      <ShopNav handle={shop.handle} back />

      <section className="mx-auto max-w-5xl px-5 pb-20 pt-10 md:pb-28 md:pt-14">
        <div className="grid gap-10 md:grid-cols-2 md:gap-12">
          {/* Scroll-snap on phones, a plain vertical stack from md up. No JS. */}
          <div
            className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 md:mx-0 md:block md:overflow-visible md:px-0"
            aria-label={`Photos of ${title}`}
          >
            {photos.length > 0 ? (
              photos.map((src, index) => (
                <div
                  key={src}
                  className="relative aspect-[4/5] w-[86%] shrink-0 snap-center overflow-hidden rounded-2xl border border-hairline bg-surface2 md:mb-4 md:w-full"
                >
                  <Image
                    src={src}
                    alt={`${title} — photo ${index + 1}`}
                    fill
                    sizes="(max-width: 768px) 86vw, 45vw"
                    priority={index === 0}
                    className="object-cover"
                  />
                </div>
              ))
            ) : (
              <div className="flex aspect-[4/5] w-full items-center justify-center rounded-2xl border border-hairline bg-surface2">
                <span className="text-[13px] leading-[1.4] text-inkfaint">No photos yet</span>
              </div>
            )}
          </div>

          <div className="md:sticky md:top-24 md:self-start">
            <p className="tnum text-[12px] uppercase leading-[1.4] tracking-[0.18em] text-inkfaint">
              {item.code}
            </p>
            <h1
              className="display mt-3 text-balance leading-[1.02]"
              style={{ fontSize: "clamp(1.75rem, 2.4vw + 1rem, 2.5rem)" }}
            >
              {item.brand}
              {item.name?.trim() ? (
                <>
                  <span className="text-inkfaint"> · </span>
                  <span className="text-inkdim">{item.name}</span>
                </>
              ) : null}
            </h1>

            <p className="display-black mt-5 text-4xl text-acid">{formatPeso(item.price)}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-hairline px-3 py-1.5 text-[12px] leading-[1.3] text-inkdim">
                {item.condition}
              </span>
              <span className="rounded-full border border-hairline px-3 py-1.5 text-[12px] leading-[1.3] text-inkdim">
                {item.category}
              </span>
              {item.status === "sold" ? (
                <span className="display rounded-full border border-danger px-3 py-1.5 text-[12px] uppercase leading-[1.3] tracking-wide text-danger">
                  Sold
                </span>
              ) : null}
            </div>

            {specs.length > 0 ? (
              <dl className="mt-8 divide-y divide-hairline border-y border-hairline">
                {specs.map(([key, value]) => (
                  <div key={key} className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="text-[13px] leading-[1.4] text-inkfaint">{key}</dt>
                    <dd className="tnum text-[14px] leading-[1.4] text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <InquiryButtons
              message={message}
              subject={inquirySubject({ brand: item.brand, name: item.name, code: item.code })}
              itemUrl={url}
              messenger={shop.contact_messenger}
              instagram={shop.contact_instagram}
              email={shop.contact_email}
            />
          </div>
        </div>
      </section>

      <ShopFooter />
    </div>
  );
}
