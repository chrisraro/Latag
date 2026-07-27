import { PhoneDemo } from "@/components/PhoneDemo";
import { Pricing } from "@/components/Pricing";
import { Showcase } from "@/components/Showcase";
import { Badge, CheckItem, CtaButton, SectionTitle } from "@/components/ui";

/** Shared card surface. Hover physics live here so every grid on the page
 *  responds identically — lift, warm the border, brighten the fill. */
const CARD =
  "rounded-2xl border border-hairline bg-surface1 p-6 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-1 hover:border-acid/35 hover:bg-surface2";

/** Mirrors apps/mobile lib/catalog.ts — each department's own measurements. */
const DEPARTMENTS = [
  { name: "Tops", specs: "Pit-to-pit, length, sleeve", types: "Tee, polo, jersey, crewneck, sweater, hoodie, jacket" },
  { name: "Bottoms", specs: "Waist, inseam, rise, leg opening", types: "Jeans, trousers, cargo, shorts, skirt" },
  { name: "Dresses", specs: "Pit-to-pit, length, waist", types: "Dress, jumpsuit" },
  { name: "Footwear", specs: "US size, insole in cm", types: "Sneakers, boots, sandals, leather" },
  { name: "Bags", specs: "Width, height, depth, strap drop", types: "Backpack, shoulder, tote, sling, duffel" },
  { name: "Accessories", specs: "Condition and price — no invented sizes", types: "Cap, belt, scarf, beanie, watch, eyewear" },
];

const SHOP_STEPS = [
  {
    n: "1",
    h: "Claim your handle",
    p: "Pick the name buyers already call you. Your page lives at latag.vercel.app/shop/yourname and stays yours.",
  },
  {
    n: "2",
    h: "Publish only what you choose",
    p: "Tap publish on the pieces you want to sell. Each listing gets a short code like LT-7K2Q9. Everything you skip never leaves the phone.",
  },
  {
    n: "3",
    h: "Share one link",
    p: "One URL for your FB post, your IG bio, your Messenger broadcast. Buyers browse photos, measurements, condition and price.",
  },
  {
    n: "4",
    h: "The inquiry writes itself",
    p: "Buyer taps Message and the chat opens with the item code, name and price already written. No more \"which one po?\" threads.",
  },
];

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section aria-labelledby="hero-title" className="mx-auto max-w-6xl px-5 pb-20 pt-8 sm:px-6 sm:pb-24 sm:pt-14">
        <Badge>Ukay inventory + storefronts</Badge>
        <h1
          id="hero-title"
          className="display-black mt-6 text-balance uppercase leading-[0.94] text-ink"
          style={{ fontSize: "clamp(2rem, 5.6vw, 4.25rem)" }}
        >
          Run your whole ukay inventory.{" "}
          <span className="text-acid">Hand buyers a shop page.</span>
        </h1>

        <div className="mt-14 grid items-start gap-14 lg:grid-cols-[1.05fr_auto]">
          <div>
            <p className="max-w-[52ch] text-lg leading-relaxed text-inkdim">
              Latag holds every piece you own — tops, bottoms, dresses, footwear, bags, accessories — in one
              searchable inventory that works with the signal off. Publish the pieces you want to sell to your own
              public page, and buyers inquire with the item code already typed.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <CtaButton href="/pro">Get Latag</CtaButton>
              <CtaButton href="#storefront" secondary>
                See how the shop works
              </CtaButton>
            </div>
            <dl className="tnum mt-12 grid max-w-lg grid-flow-dense grid-cols-2 gap-6 border-t border-hairline pt-7 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wider text-inkfaint">PH ukay brands</dt>
                <dd className="display-black mt-1 text-2xl text-ink">469</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-inkfaint">Departments</dt>
                <dd className="display-black mt-1 text-2xl text-ink">6</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-inkfaint">Items, free</dt>
                <dd className="display-black mt-1 text-2xl text-acid">Unlimited</dd>
              </div>
            </dl>
            <p className="mt-8 text-sm text-inkfaint">
              Latag for Android is in final QA — downloads and Pro purchases open together.
            </p>
          </div>
          <PhoneDemo />
        </div>
      </section>

      {/* INVENTORY */}
      <section aria-labelledby="inventory-title" className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
          <SectionTitle id="inventory-title">Your inventory is the home screen.</SectionTitle>
          <p className="mt-5 max-w-[64ch] text-lg text-inkdim">
            Not a list of trips — a list of stock. Every item from every batch on one screen, with the count,
            how many are still available, and what the whole rack is worth. Search a brand, filter by
            department, cycle the sort, tap through to the piece.
          </p>

          <div className="mt-12 grid grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEPARTMENTS.map((d) => (
              <div key={d.name} className={CARD}>
                <h3 className="display text-lg text-ink">{d.name}</h3>
                <p className="mt-2 text-sm text-acid">{d.specs}</p>
                <p className="mt-2 text-sm text-inkdim">{d.types}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-flow-dense gap-4 lg:grid-cols-3">
            <div className={`${CARD} lg:col-span-2`}>
              <h3 className="display text-lg text-ink">469 PH ukay brands, already in the app</h3>
              <p className="mt-2 max-w-[58ch] text-inkdim">
                The brands that actually turn up in Philippine bales — searchable the moment you install, with no
                connection required. Hit something the list has never seen and you add it yourself; it sticks for
                every item after.
              </p>
            </div>
            <div className={CARD}>
              <h3 className="display text-lg text-ink">Five seconds per item</h3>
              <p className="mt-2 text-inkdim">
                Wheels for measurements and price, chips for brand and condition, haptic ticks so you never look
                away from the pile. Values carry to the next piece.
              </p>
            </div>
          </div>

          <ul className="mt-10 grid grid-flow-dense gap-3 sm:grid-cols-2">
            <CheckItem>Search across all stock — brand, name or category</CheckItem>
            <CheckItem>Filter by department, available or sold</CheckItem>
            <CheckItem>Four photo slots per piece: front, back, tag, flaw</CheckItem>
            <CheckItem>Sold tracking at the real haggled price</CheckItem>
          </ul>
        </div>
      </section>

      {/* STOREFRONT */}
      <section id="storefront" aria-labelledby="storefront-title" className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
          <SectionTitle id="storefront-title">One link. Buyers browse. Inquiries arrive pre-written.</SectionTitle>
          <p className="mt-5 max-w-[64ch] text-lg text-inkdim">
            Stop re-posting the same piece to three platforms and answering the same three questions. Publish
            once from your inventory and every listing has a permanent address, a short code, and a Message
            button that does the typing for the buyer.
          </p>

          <div className="mt-12 grid grid-flow-dense gap-4 sm:grid-cols-2">
            {SHOP_STEPS.map((s) => (
              <div key={s.n} className={CARD}>
                <span
                  aria-hidden
                  className="display flex h-9 w-9 items-center justify-center rounded-full bg-acid text-[15px] text-acidink"
                >
                  {s.n}
                </span>
                <h3 className="display mt-4 text-lg text-ink">{s.h}</h3>
                <p className="mt-2 text-inkdim">{s.p}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-flow-dense gap-4 lg:grid-cols-[1fr_1fr]">
            <div className={CARD}>
              <h3 className="display text-lg text-ink">What lands in your chat</h3>
              <p className="mt-2 text-inkdim">
                Three lines, code first. Even if every prefill in the world fails, the buyer can type five
                characters and you still know the exact piece off the rack.
              </p>
              <pre className="mt-5 overflow-x-auto rounded-xl border border-hairline bg-surface2 p-5 font-sans text-sm leading-7 text-inkdim">
{`[LT-7K2Q9] Hi! Is this still available?
Carhartt Detroit Jacket — 9/10 — ₱850
latag.vercel.app/shop/thriftlord/LT-7K2Q9`}
              </pre>
            </div>
            <div className={CARD}>
              <h3 className="display text-lg text-ink">Three channels, honestly labelled</h3>
              <ul className="mt-4 space-y-4 text-inkdim">
                {/* The separator is an explicit expression, not JSX text: a leading
                    space in a text node that also carries an entity gets trimmed. */}
                <li>
                  <span className="font-semibold text-ink">Messenger</span>
                  {" — "}
                  opens with the message already filled into the composer. The buyer just hits send.
                </li>
                <li>
                  <span className="font-semibold text-ink">Email</span>
                  {" — "}
                  subject and body both prefilled, item code in the subject line.
                </li>
                <li>
                  <span className="font-semibold text-ink">Instagram</span>
                  {" — "}
                  Instagram&apos;s DM links cannot carry text, so Latag copies the message to the
                  buyer&apos;s clipboard and opens the chat for them to paste. We would rather say
                  that than pretend.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <CtaButton href="/pro">Get the shop page</CtaButton>
          </div>
        </div>
      </section>

      {/* SHOWCASE */}
      <section aria-labelledby="showcase-title" className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-20 sm:px-6 sm:pt-28">
          <SectionTitle id="showcase-title">Straight from the app.</SectionTitle>
          <p className="mt-5 max-w-[60ch] text-lg text-inkdim">
            Real screens, no mockups. Swipe through — tap any card to look closer.
          </p>
        </div>
        <Showcase />
      </section>

      {/* BATCHES */}
      <section aria-labelledby="batches-title" className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
          <SectionTitle id="batches-title">Every batch still has to pay for itself.</SectionTitle>
          <p className="mt-5 max-w-[64ch] text-lg text-inkdim">
            Inventory tells you what you have. Batches tell you whether the buy was any good. Group a sourcing
            run, pin where it came from, and watch the money math the whole time you are digging.
          </p>

          <div className="mt-12 grid grid-flow-dense gap-4 sm:grid-cols-2">
            <div className={CARD}>
              <h3 className="display text-lg text-ink">Selector</h3>
              <p className="mt-2 text-inkdim">
                Cherry-pick at per-item prices. Latag tracks profit piece by piece — projected while you buy,
                realized as pieces sell.
              </p>
            </div>
            <div className={CARD}>
              <h3 className="display text-lg text-ink">Bulto</h3>
              <p className="mt-2 text-inkdim">
                One fixed cost for the whole bale. Latag tracks capital recovery to break-even and past it, so
                you know when the bale turned into profit.
              </p>
            </div>
            <div className={CARD}>
              <h3 className="display text-lg text-ink">Map-pinned sourcing runs</h3>
              <p className="mt-2 text-inkdim">
                Pin the warehouse, the stall, the basement. Six months later you still know which spot produced
                the batch that actually made money.
              </p>
            </div>
            <div className={CARD}>
              <h3 className="display text-lg text-ink">Scheduled bale runs with alarms</h3>
              <p className="mt-2 text-inkdim">
                Schedule the drop, set reminders — at the time, thirty minutes, an hour or a day before. Your
                phone wakes you up for it, offline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PRIVACY */}
      <section aria-labelledby="privacy-title" className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
          <SectionTitle id="privacy-title">Nothing leaves the phone until you publish it.</SectionTitle>
          <p className="mt-5 max-w-[64ch] text-lg text-inkdim">
            Your inventory, your photos, your costs and your margins stay on the phone. Only the items you
            explicitly publish go online — and published listings carry no cost or profit data at all.
          </p>
          <p className="mt-5 max-w-[64ch] text-inkdim">
            That last part is structural, not a policy: a listing has columns for brand, name, condition,
            measurements, price and photos. There is no column anywhere for what you paid. We could not read
            your margins if we wanted to.
          </p>
          <div className="mt-9">
            <CtaButton href="/data" secondary>
              Read the data promise
            </CtaButton>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section aria-labelledby="pricing-title" className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
          <SectionTitle id="pricing-title">Free forever. Pay once for the shop.</SectionTitle>
          <p className="mt-5 max-w-[64ch] text-lg text-inkdim">
            Unlimited inventory on the free tier — no item cap, no trial clock, no subscription. Pro is a
            one-time unlock, and what it buys you is the storefront.
          </p>
          <div className="mt-12">
            <Pricing />
          </div>
        </div>
      </section>
    </>
  );
}
