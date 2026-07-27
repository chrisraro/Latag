import { CtaButton, CheckItem } from "./ui";

export function Pricing({ detailed }: { detailed?: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
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
      <section aria-labelledby="pro-plan" className="rounded-2xl border border-acid bg-surface1 p-6">
        <h3 id="pro-plan" className="display text-xl text-acid">Pro</h3>
        <p className="mt-1 text-3xl font-bold text-ink">
          One-time <span className="text-base font-medium text-inkfaint">· no subscription</span>
        </p>
        <ul className="mt-5 space-y-2.5 text-sm">
          <CheckItem>Your own shop page — publish items buyers can browse</CheckItem>
          <CheckItem>One link to share on FB, IG or Messenger</CheckItem>
          <CheckItem>Buyer inquiries land in your DMs, pre-written</CheckItem>
          <CheckItem>Everything in Free</CheckItem>
          <CheckItem>Pay once on the web — GCash, Maya &amp; cards at launch</CheckItem>
          <CheckItem>Costs and margins still never leave your phone — published items carry price only</CheckItem>
        </ul>
        {detailed ? (
          <p className="mt-5 rounded-xl border border-hairline bg-surface2 p-4 text-sm text-inkdim">
            Purchases open soon. Pro unlocks are activated by signing in once inside the app — after that, Latag never needs a connection again.
          </p>
        ) : (
          <div className="mt-5"><CtaButton href="/pro">See Pro details</CtaButton></div>
        )}
      </section>
    </div>
  );
}
