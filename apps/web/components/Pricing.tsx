"use client";

import { CtaButton, CheckItem } from "./ui";

const MONTHLY_SKU = "latag-pro-monthly";
const YEARLY_SKU = "latag-pro-yearly";

export function Pricing({
  detailed,
  selectedSku,
  onSelect,
}: {
  detailed?: boolean;
  selectedSku?: string;
  onSelect?: (sku: string) => void;
}) {
  const yearlySavings = Math.round((1 - 1799 / (199 * 12)) * 100); // ~25%

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {/* Free */}
      <section aria-labelledby="free-plan" className="rounded-2xl border border-hairline bg-surface1 p-6">
        <h3 id="free-plan" className="display text-xl text-ink">Free</h3>
        <p className="tnum mt-1 text-3xl font-bold text-ink">₱0</p>
        <ul className="mt-5 space-y-2.5 text-sm">
          <CheckItem>Unlimited item logs — no cap, no timer</CheckItem>
          <CheckItem>Unlimited batches, photos &amp; dashboards</CheckItem>
          <CheckItem>IG drop export</CheckItem>
          <CheckItem>Works 100% offline — nothing leaves your phone unless you publish</CheckItem>
        </ul>
      </section>

      {/* Pro — stacked monthly + yearly */}
      <section aria-labelledby="pro-plan" className="flex flex-col gap-3">
        {/* Monthly */}
        <div
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onClick={() => onSelect?.(MONTHLY_SKU)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(MONTHLY_SKU); } }}
          className={`cursor-pointer rounded-2xl border bg-surface1 p-5 transition-all hover:border-acid/60 ${
            selectedSku === MONTHLY_SKU ? "border-acid" : "border-hairline"
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="display text-lg text-ink">Monthly</h3>
            {selectedSku === MONTHLY_SKU ? (
              <span className="display rounded-full bg-acid px-2.5 py-0.5 text-[10.5px] text-acidink">Selected</span>
            ) : null}
          </div>
          <p className="tnum mt-1 text-2xl font-bold text-ink">
            ₱199<span className="text-sm font-medium text-inkfaint">/month</span>
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <CheckItem>Your own shop page — publish items buyers can browse</CheckItem>
            <CheckItem>Buyer inquiries land in your DMs, pre-written</CheckItem>
          </ul>
        </div>

        {/* Yearly (best value) */}
        <div
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onClick={() => onSelect?.(YEARLY_SKU)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(YEARLY_SKU); } }}
          className={`cursor-pointer rounded-2xl border bg-surface1 p-5 transition-all hover:border-acid/60 ${
            selectedSku === YEARLY_SKU ? "border-acid" : "border-hairline"
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="display text-lg text-ink">Yearly</h3>
            <span className="display rounded-full bg-acid/15 px-2.5 py-0.5 text-[10.5px] text-acid">
              Save {yearlySavings}%
            </span>
          </div>
          <p className="tnum mt-1 text-2xl font-bold text-ink">
            ₱1,799<span className="text-sm font-medium text-inkfaint">/year</span>
          </p>
          <p className="mt-0.5 text-xs text-inkdim">≈₱150/month — save ₱589/year vs monthly</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <CheckItem>Everything in Monthly</CheckItem>
            <CheckItem>Best value — lowest price per month</CheckItem>
          </ul>
        </div>

        {detailed ? (
          <p className="rounded-xl border border-hairline bg-surface2 p-4 text-sm text-inkdim">
            <strong className="text-ink">14-day free trial.</strong> Your first 14 days are on us.
            No charge until after the trial. Cancel anytime in your account settings — no questions asked.
            Pro unlocks by signing in once inside the app.
          </p>
        ) : null}
      </section>
    </div>
  );
}
