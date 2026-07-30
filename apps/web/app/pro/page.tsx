import type { Metadata } from "next";
import { RCBuyButton } from "@/components/RCBuyButton";

export const metadata: Metadata = { title: "Pricing", alternates: { canonical: "/pro" } };

export default function ProPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6">
      <h1 className="display-black text-balance text-4xl uppercase text-ink">Your shop. Low monthly.</h1>
      <p className="mt-4 max-w-[58ch] text-lg text-inkdim">
        Inventory is free forever — unlimited items, no cap, no clock. Pro unlocks your public shop
        page for a low monthly or yearly subscription. First 14 days are free, cancel anytime.
      </p>

      <div className="mt-10 max-w-md">
        {/* Download / subscribe via Google Play — see RCBuyButton for iOS status */}
        <RCBuyButton />
      </div>
    </div>
  );
}
