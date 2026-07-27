import type { Metadata } from "next";
import { Pricing } from "@/components/Pricing";

export const metadata: Metadata = { title: "Pricing" };

export default function ProPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6">
      <h1 className="display-black text-balance text-4xl uppercase text-ink">One price. Yours forever.</h1>
      <p className="mt-4 max-w-[58ch] text-lg text-inkdim">
        Inventory is free forever — unlimited items, no cap, no clock. Pro is a one-time unlock that adds
        your public shop page: no subscription, no renewal, no store fees baked into the price. Purchases
        open here on the web soon: sign in once in the app, and it's yours for good.
      </p>
      <div className="mt-10"><Pricing detailed /></div>
    </div>
  );
}
