"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { departmentLabel, formatPeso, itemTitle, specEntries, type ShopItem } from "../../../lib/shop-format";

/**
 * The stock grid. Filtering is client-side on purpose: the whole shop is already
 * in the payload, so a department tap is instant and — crucially — the page
 * stays ISR-cacheable, which a `?dept=` search param would have prevented.
 *
 * From `md` up, every eighth card is promoted to a 2×2 feature so a long grid
 * has rhythm, and `grid-flow-dense` backfills the gaps those spans would leave.
 * Phones keep a plain two-up: a 2×2 card there is nearly a full screen of
 * scrolling for one item, which is the opposite of scanning stock quickly.
 */

const ALL = "all";

function sizeLine(item: ShopItem): string {
  const parts = specEntries(item.specs)
    .slice(0, 2)
    .map(([k, v]) => `${k} ${v}`);
  return parts.join(" · ");
}

function PhotoFrame({ item, featured }: { item: ShopItem; featured: boolean }) {
  const src = item.photo_urls?.[0];
  return (
    <div
      className={`relative overflow-hidden bg-surface2 ${
        featured ? "aspect-[4/5] md:aspect-auto md:min-h-0 md:flex-1" : "aspect-[4/5]"
      }`}
    >
      {src ? (
        <Image
          src={src}
          alt={itemTitle(item)}
          fill
          sizes={featured ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 25vw"}
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="tnum text-[12px] leading-[1.4] text-inkfaint">{item.code}</span>
        </div>
      )}

      <span className="absolute left-2 top-2 rounded-full border border-hairline bg-black/70 px-2 py-1 text-[11px] leading-[1.3] text-inkdim backdrop-blur-sm">
        {item.condition}
      </span>

      {item.status === "sold" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65">
          <span className="display rounded-full border border-hairline px-4 py-1.5 text-[13px] uppercase tracking-[0.2em] text-ink">
            Sold
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ItemCard({ handle, item, featured }: { handle: string; item: ShopItem; featured: boolean }) {
  const size = sizeLine(item);
  return (
    <Link
      href={`/shop/${handle}/${item.code}`}
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-hairline bg-surface1 transition-colors hover:border-inkfaint/40 ${
        featured ? "md:col-span-2 md:row-span-2" : ""
      }`}
    >
      <PhotoFrame item={item} featured={featured} />
      <div className="p-4">
        <p className="truncate text-[13px] leading-[1.4] text-ink">{itemTitle(item)}</p>
        {size ? (
          <p className="mt-1 truncate text-[12px] leading-[1.4] text-inkfaint">{size}</p>
        ) : null}
        <p className="display mt-2 text-[15px] text-acid">{formatPeso(item.price)}</p>
      </div>
    </Link>
  );
}

export function ShopGrid({ handle, items }: { handle: string; items: ShopItem[] }) {
  const [dept, setDept] = useState<string>(ALL);

  const departments = useMemo(() => {
    const seen: string[] = [];
    for (const i of items) if (!seen.includes(i.department)) seen.push(i.department);
    return seen;
  }, [items]);

  const visible = useMemo(
    () => (dept === ALL ? items : items.filter((i) => i.department === dept)),
    [items, dept]
  );

  if (items.length === 0) {
    return (
      <p className="mx-auto max-w-5xl px-5 text-inkdim">No items listed yet.</p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5">
      {departments.length > 1 ? (
        <div
          role="group"
          aria-label="Filter by department"
          className="mb-8 flex flex-wrap gap-2"
        >
          {[ALL, ...departments].map((key) => {
            const active = dept === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setDept(key)}
                className={`display flex min-h-11 items-center rounded-full border px-4 text-[12px] uppercase tracking-wide transition-colors ${
                  active
                    ? "border-acid bg-acid text-acidink"
                    : "border-hairline bg-surface1 text-inkdim hover:text-ink"
                }`}
              >
                {key === ALL ? "All" : departmentLabel(key)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid auto-rows-fr grid-flow-dense grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {visible.map((item, index) => (
          <ItemCard key={item.code} handle={handle} item={item} featured={index % 8 === 0} />
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-inkdim">Nothing in {departmentLabel(dept)} right now.</p>
      ) : null}
    </div>
  );
}
