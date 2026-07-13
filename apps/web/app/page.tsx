import { PhoneDemo } from "@/components/PhoneDemo";
import { Pricing } from "@/components/Pricing";
import { Badge, CheckItem, CtaButton, SectionTitle } from "@/components/ui";

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="mx-auto grid max-w-5xl items-center gap-12 px-5 pb-20 pt-10 sm:grid-cols-2 sm:pt-16">
        <div>
          <Badge>Built for ukay-ukay resellers</Badge>
          <h1 className="display-black mt-5 text-balance text-4xl uppercase leading-tight text-ink sm:text-5xl">
            Log fast.<br />Know your margins.<br /><span className="text-acid">Work offline.</span>
          </h1>
          <p className="mt-5 max-w-[46ch] text-lg text-inkdim">
            Latag is the pocket ops console for vintage sellers: log a piece in 5 seconds one-handed,
            watch profit math update live, and drop to Instagram in one tap — in warehouses with zero signal.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaButton href="/pro">Get Latag</CtaButton>
            <CtaButton href="/data" secondary>How your data stays yours</CtaButton>
          </div>
          <p className="mt-4 text-sm text-inkfaint">
            Latag for Android is in final QA — downloads and Pro purchases open together.
          </p>
        </div>
        <PhoneDemo />
      </section>

      {/* THE TWO MODES */}
      <section aria-label="Two ways to buy. One console." className="border-t border-hairline">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <SectionTitle>Two ways to buy. One console.</SectionTitle>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-hairline bg-surface1 p-6">
              <h3 className="display text-lg text-ink">Selector</h3>
              <p className="mt-2 text-inkdim">Cherry-pick pieces at per-item prices. Latag tracks profit piece by piece — projected and realized.</p>
            </div>
            <div className="rounded-2xl border border-hairline bg-surface1 p-6">
              <h3 className="display text-lg text-ink">Bulto</h3>
              <p className="mt-2 text-inkdim">Buy the whole bale at one fixed cost. Latag tracks capital recovery to break-even and beyond.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5-SECOND LOGGING */}
      <section aria-label="Five seconds per item. Zero typing." className="border-t border-hairline">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <SectionTitle>Five seconds per item. Zero typing.</SectionTitle>
          <p className="mt-4 max-w-[60ch] text-inkdim">
            Scroll wheels for measurements and price. Chips for brand, category, condition. Haptic ticks so you
            never look away from the pile. Four photo slots — front, back, tag, flaw — compressed and saved on your phone.
          </p>
          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <CheckItem>One-handed thumb entry, tuned for 6-hour digs</CheckItem>
            <CheckItem>Sticky values make batches nearly instant</CheckItem>
            <CheckItem>Live projected totals as you log</CheckItem>
            <CheckItem>Sold tracking with real haggled prices</CheckItem>
          </ul>
        </div>
      </section>

      {/* OFFLINE / PRIVACY */}
      <section aria-label="No signal. No servers. No problem." className="border-t border-hairline">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <SectionTitle>No signal. No servers. No problem.</SectionTitle>
          <p className="mt-4 max-w-[60ch] text-inkdim">
            Warehouses and basements kill cell signal — Latag doesn't care. Your inventory, photos, and money math
            live in a database on your phone. Nothing is uploaded. We couldn't read your stock list if we wanted to.
          </p>
          <div className="mt-6"><CtaButton href="/data" secondary>Read the data promise</CtaButton></div>
        </div>
      </section>

      {/* IG EXPORT */}
      <section aria-label="From rack to drop in one tap." className="border-t border-hairline">
        <div className="mx-auto max-w-5xl grid gap-10 px-5 py-20 sm:grid-cols-2 sm:items-center">
          <div>
            <SectionTitle>From rack to drop in one tap.</SectionTitle>
            <p className="mt-4 text-inkdim">
              Select the pieces, and Latag writes the whole drop caption — sizes, condition, prices, claim
              instructions — ready to paste into Instagram.
            </p>
          </div>
          <pre className="tnum overflow-x-auto rounded-2xl border border-hairline bg-surface1 p-5 text-sm leading-7 text-inkdim">
{`👕 Stüssy Tee
📏 Size: (PTP: 21" | L: 27")
✨ Condition: 9/10
💸 ₱550
📍 Comment "Mine" to claim
---`}
          </pre>
        </div>
      </section>

      {/* PRICING */}
      <section aria-label="Free to grind. Pay once to go pro." className="border-t border-hairline">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <SectionTitle>Free to grind. Pay once to go pro.</SectionTitle>
          <div className="mt-8"><Pricing /></div>
        </div>
      </section>
    </>
  );
}
