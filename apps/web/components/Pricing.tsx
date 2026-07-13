import { CtaButton, CheckItem } from "./ui";

export function Pricing({ detailed }: { detailed?: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <section aria-labelledby="free-plan" className="rounded-2xl border border-hairline bg-surface1 p-6">
        <h3 id="free-plan" className="display text-xl text-ink">Free</h3>
        <p className="tnum mt-1 text-3xl font-bold text-ink">₱0</p>
        <ul className="mt-5 space-y-2.5 text-sm">
          <CheckItem>20 item logs — yours forever, no timer</CheckItem>
          <CheckItem>Unlimited sessions, photos &amp; dashboards</CheckItem>
          <CheckItem>IG drop export</CheckItem>
          <CheckItem>Works 100% offline</CheckItem>
        </ul>
      </section>
      <section aria-labelledby="pro-plan" className="rounded-2xl border border-acid bg-surface1 p-6">
        <h3 id="pro-plan" className="display text-xl text-acid">Pro</h3>
        <p className="mt-1 text-3xl font-bold text-ink">
          One-time <span className="text-base font-medium text-inkfaint">· no subscription</span>
        </p>
        <ul className="mt-5 space-y-2.5 text-sm">
          <CheckItem>Unlimited item logs</CheckItem>
          <CheckItem>Everything in Free</CheckItem>
          <CheckItem>Pay once on the web — GCash, Maya &amp; cards at launch</CheckItem>
          <CheckItem>Still 100% offline. Your inventory never touches our servers.</CheckItem>
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
