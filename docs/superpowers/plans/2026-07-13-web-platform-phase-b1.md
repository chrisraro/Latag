# Latag Web Platform Phase B1 (Landing + Legal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public face of Latag — a Next.js monolith at `apps/web` with the marketing landing page, pricing, the `/pro` page the mobile app references, and truthful legal/trust pages — deployable with zero external services.

**Architecture:** Next.js (current, ≥15) App Router in the existing pnpm monorepo; static-first pages (no DB, no auth in B1); Warehouse Console design system ported to web via Tailwind v4 `@theme` tokens and the Archivo **variable** font (web gets the real width axis via `font-stretch`); Phase B2 (Supabase portal, admin, payments) slots into the same app later.

**Tech Stack:** Next.js App Router · TypeScript strict · Tailwind CSS v4 · `next/font/google` Archivo variable · pnpm workspace

## Global Constraints

- **Design tokens byte-exact from DESIGN.md:** bg `#000000`, surface1 `#111111`, surface2 `#1A1A1A`, hairline `#262626`, ink `#F2F2F2`, inkdim `#ADADAD`, inkfaint `#8A8A8A`, acid `#B8F135`, acidink `#141A05`, danger `#FF5A3C`. Dark-only site (it showcases a dark-only app). Acid only for money-positive/action emphasis; one primary CTA per viewport-height of content.
- **Typography:** Archivo variable via `next/font/google` (weights 100–900, width axis). Display voice = `font-stretch: 125%` weight 800–900 (titles, CTAs uppercase +0.03em); text voice = normal width. Tabular numerals (`font-variant-numeric: tabular-nums`) on all prices/figures. Body line length ≤ 70ch.
- **Truthful legal commitments (from the platform spec §4.4 — copy in Task 6 is the binding text):** inventory/photos never leave the phone; account data TLS + encrypted at rest, licensing only; payments via PCI-DSS provider, no card/e-wallet storage by us; telemetry = anonymous counters with in-app opt-out; self-serve deletion. NO overpromising ("military-grade", "zero-knowledge" etc. are banned words).
- **The mobile app references `latag.ph/pro`** — route `/pro` must exist and render pricing + "purchases open soon" state (B2 wires checkout).
- **No backend:** zero API routes, no DB, no env secrets in B1. Everything statically renderable (`next build` must succeed with static output for all pages).
- **Web quality bar:** semantic landmarks, exactly one `h1` per page, alt text on images, visible focus states, WCAG AA contrast, `prefers-reduced-motion` honored, no horizontal scroll at 360px–1440px.
- Verification gates per task: `pnpm -C apps/web exec tsc --noEmit` and `pnpm -C apps/web build`. Commit at the end of every task.

**File structure (end state):**

```
apps/web/
  app/layout.tsx            fonts, metadata, dark shell, header/footer
  app/page.tsx              landing (hero, modes, logging, privacy, export, pricing CTA)
  app/pro/page.tsx          pricing detail + purchases-open-soon
  app/privacy/page.tsx      privacy policy
  app/terms/page.tsx        terms of use
  app/data/page.tsx         data & security page
  app/sitemap.ts  app/robots.ts  app/icon.svg
  components/ui.tsx         Button, Badge, SectionTitle, Check list item
  components/PhoneDemo.tsx  CSS phone mock of the dashboard (no images needed)
  components/Pricing.tsx    Free vs Pro table (shared by / and /pro)
  app/globals.css           @theme tokens + base styles
```

---

### Task 1: Scaffold `apps/web` (Next.js in the monorepo)

**Files:**
- Create (generated): `apps/web/*` via create-next-app (replacing the placeholder README)
- Modify: root `package.json` (add `web`, `web:build` scripts)

**Interfaces:**
- Produces: bootable Next.js app at `apps/web`; `pnpm -C apps/web build` exits 0; root scripts `web` (dev) and `web:build`.

- [ ] **Step 1:** From repo root: move the placeholder aside and scaffold:
```
mv apps/web/README.md /tmp/web-readme-b2notes.md 2>/dev/null || true
npx create-next-app@latest apps/web --ts --app --tailwind --no-eslint --no-src-dir --import-alias "@/*" --use-pnpm --turbopack
```
(If the CLI asks anything else, take defaults; if `apps/web` non-empty blocks it, delete the README first — its Phase-B pointer content is superseded by this plan.)

- [ ] **Step 2:** Root `package.json` scripts — add:
```json
"web": "pnpm -C apps/web dev",
"web:build": "pnpm -C apps/web build"
```

- [ ] **Step 3:** Ensure `apps/web/tsconfig.json` has `"strict": true`. Remove template boilerplate page content (keep files; Task 2 rewrites them). Delete unused template assets in `apps/web/public/` (svg logos).

- [ ] **Step 4:** Verify: `pnpm install` → 0; `pnpm web:build` → build succeeds.

- [ ] **Step 5:** Commit: `chore(web): scaffold Next.js app in monorepo`

---

### Task 2: Tokens, fonts, base layout

**Files:**
- Modify: `apps/web/app/globals.css`, `apps/web/app/layout.tsx`
- Create: `apps/web/app/icon.svg`

**Interfaces:**
- Produces: Tailwind classes `bg-bg text-ink border-hairline bg-surface1 bg-surface2 text-inkdim text-inkfaint bg-acid text-acidink text-danger`; CSS utility classes `.display` (Expanded voice) and `.tnum`; `<Header/>`/`<Footer/>` inline in layout with nav (Pricing, Privacy, Terms, Data); Archivo variable loaded with `--font-archivo`.

- [ ] **Step 1:** `apps/web/app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-bg: #000000;
  --color-surface1: #111111;
  --color-surface2: #1a1a1a;
  --color-hairline: #262626;
  --color-ink: #f2f2f2;
  --color-inkdim: #adadad;
  --color-inkfaint: #8a8a8a;
  --color-acid: #b8f135;
  --color-acidink: #141a05;
  --color-danger: #ff5a3c;
  --font-sans: var(--font-archivo), system-ui, sans-serif;
}

body { background: var(--color-bg); color: var(--color-ink); }

.display { font-stretch: 125%; font-weight: 800; }
.display-black { font-stretch: 125%; font-weight: 900; }
.tnum { font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 2:** `apps/web/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://latag.ph"),
  title: { default: "Latag — the ukay ops console", template: "%s · Latag" },
  description:
    "Log a piece in 5 seconds, know your margins instantly, and drop to Instagram in one tap. 100% offline — built for ukay-ukay resellers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Link href="/" className="display-black text-xl uppercase tracking-wide text-acid">Latag</Link>
          <nav aria-label="Main" className="flex items-center gap-5 text-sm text-inkdim">
            <Link className="hover:text-ink focus-visible:text-ink" href="/pro">Pricing</Link>
            <Link className="hover:text-ink focus-visible:text-ink" href="/data">Data</Link>
            <Link
              href="/pro"
              className="display rounded-full bg-acid px-4 py-2 text-[13px] uppercase tracking-wide text-acidink"
            >
              Get Pro
            </Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mx-auto mt-24 max-w-5xl border-t border-hairline px-5 py-10 text-sm text-inkfaint">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} Latag · Made for the ukay grind</p>
            <nav aria-label="Legal" className="flex gap-5">
              <Link className="hover:text-inkdim" href="/privacy">Privacy</Link>
              <Link className="hover:text-inkdim" href="/terms">Terms</Link>
              <Link className="hover:text-inkdim" href="/data">Data &amp; Security</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 3:** `apps/web/app/icon.svg` — acid "L" mark:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#000"/><path d="M20 14h10v26h16v10H20z" fill="#B8F135"/></svg>
```

- [ ] **Step 4:** Verify `pnpm web:build` → 0. Commit: `feat(web): tokens, Archivo variable, dark shell`

---

### Task 3: Web UI kit

**Files:** Create `apps/web/components/ui.tsx`

**Interfaces:**
- Produces: `CtaButton({ href, children, secondary? })` (display voice pill, acid or outline) · `Badge({ children })` · `SectionTitle({ children })` (h2, display voice) · `CheckItem({ children })` (acid ✓ list row).

- [ ] **Step 1:**
```tsx
import Link from "next/link";

export function CtaButton({ href, children, secondary }: { href: string; children: React.ReactNode; secondary?: boolean }) {
  return (
    <Link
      href={href}
      className={`display inline-flex h-12 items-center justify-center rounded-full px-6 text-[14px] uppercase tracking-wide transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] ${
        secondary ? "border border-hairline bg-surface2 text-ink" : "bg-acid text-acidink"
      }`}
    >
      {children}
    </Link>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="display inline-flex items-center rounded-full border border-hairline px-3 py-1 text-[11px] uppercase tracking-wider text-inkdim">
      {children}
    </span>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="display text-balance text-3xl text-ink sm:text-4xl">{children}</h2>;
}

export function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-inkdim">
      <span aria-hidden className="mt-0.5 font-bold text-acid">✓</span>
      <span>{children}</span>
    </li>
  );
}
```

- [ ] **Step 2:** Verify `pnpm web:build` → 0 (tree-shaken but compiled). Commit: `feat(web): ui kit`

---

### Task 4: `PhoneDemo` — CSS phone mock

**Files:** Create `apps/web/components/PhoneDemo.tsx`

**Interfaces:**
- Produces: `PhoneDemo()` — a pure-CSS phone frame rendering a static Bulto dashboard (recovery bar 38%, three item rows) in the exact app tokens. No images, no JS. Used in the landing hero.

- [ ] **Step 1:** Implement (static, decorative — `aria-hidden`, since the adjacent copy carries the information):
```tsx
export function PhoneDemo() {
  const rows = [
    { b: "Nike", meta: "Tee · 9/10 · PTP 21.5\" · L 27\"", p: "₱350" },
    { b: "Carhartt", meta: "Hoodie · 9/10 · PTP 24\" · L 28\"", p: "₱750" },
    { b: "Polo RL", meta: "Polo · 9/10 · PTP 22\" · L 28\"", p: "₱480" },
  ];
  return (
    <div aria-hidden className="mx-auto w-[300px] rounded-[42px] border-8 border-surface2 bg-bg p-4 shadow-[0_0_80px_-20px_rgba(184,241,53,0.25)]">
      <div className="flex items-center justify-between pt-2">
        <span className="display text-[15px] text-ink">Naga Run #4</span>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-[9px] tracking-wider text-inkdim">BULTO</span>
      </div>
      <p className="mt-4 text-[10px] uppercase tracking-widest text-inkfaint">Capital recovered</p>
      <p className="display-black tnum text-4xl text-acid">38%</p>
      <div className="mt-2 h-2.5 rounded-full border border-hairline bg-surface2">
        <div className="h-full w-[38%] rounded-full bg-acid" />
      </div>
      <p className="tnum mt-1.5 text-[10px] text-inkfaint">₱3,800 of ₱10,000 bale</p>
      <ul className="mt-4 divide-y divide-hairline">
        {rows.map((r) => (
          <li key={r.b} className="flex items-center gap-2.5 py-2.5">
            <span className="display flex h-9 w-9 items-center justify-center rounded-lg bg-surface2 text-[13px] text-inkfaint">{r.b[0]}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-ink">{r.b}</span>
              <span className="tnum block truncate text-[9px] text-inkfaint">{r.meta}</span>
            </span>
            <span className="tnum text-[12px] font-bold text-ink">{r.p}</span>
          </li>
        ))}
      </ul>
      <div className="display mt-3 rounded-full bg-acid py-2.5 text-center text-[11px] uppercase tracking-wide text-acidink">＋ Add Item</div>
    </div>
  );
}
```

- [ ] **Step 2:** Verify build. Commit: `feat(web): css phone demo`

---

### Task 5: Landing page + Pricing component

**Files:** Create `apps/web/components/Pricing.tsx`; rewrite `apps/web/app/page.tsx`

**Interfaces:**
- Produces: `Pricing({ detailed? })` — Free vs Pro comparison used on `/` (compact) and `/pro` (detailed); landing page with sections: hero (h1 + PhoneDemo), the two modes, 5-second logging, offline/privacy, IG export, pricing, final CTA.

- [ ] **Step 1:** `apps/web/components/Pricing.tsx`:
```tsx
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
```

- [ ] **Step 2:** `apps/web/app/page.tsx` — full landing. Content requirements (implement with the section rhythm below; copy verbatim):
```tsx
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
        </div>
        <PhoneDemo />
      </section>

      {/* THE TWO MODES */}
      <section aria-labelledby="modes" className="border-t border-hairline">
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
      <section aria-labelledby="logging" className="border-t border-hairline">
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
      <section aria-labelledby="offline" className="border-t border-hairline">
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
      <section aria-labelledby="export" className="border-t border-hairline">
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
      <section aria-labelledby="pricing" className="border-t border-hairline">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <SectionTitle>Free to grind. Pay once to go pro.</SectionTitle>
          <div className="mt-8"><Pricing /></div>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 3:** Verify `pnpm web:build` → 0; check at 360px and 1440px via dev server that nothing overflows horizontally. Commit: `feat(web): landing page + pricing`

---

### Task 6: `/pro` + legal pages (binding copy)

**Files:** Create `apps/web/app/pro/page.tsx`, `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/app/data/page.tsx`
- Create: `apps/web/components/Prose.tsx` (legal-page shell)

**Interfaces:**
- Produces: the four routes. `Prose({ title, updated, children })` renders an `h1`, "Last updated" line, and constrained-width article styling (`max-w-[70ch]`, headings display voice, `space-y` rhythm).

- [ ] **Step 1:** `components/Prose.tsx`:
```tsx
export function Prose({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-[70ch] px-5 py-14">
      <h1 className="display text-3xl text-ink">{title}</h1>
      <p className="mt-2 text-sm text-inkfaint">Last updated: {updated}</p>
      <div className="mt-8 space-y-5 leading-7 text-inkdim [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:text-ink [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
```

- [ ] **Step 2:** `/pro/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Pricing } from "@/components/Pricing";

export const metadata: Metadata = { title: "Pricing" };

export default function ProPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="display-black text-balance text-4xl uppercase text-ink">One price. Yours forever.</h1>
      <p className="mt-4 max-w-[55ch] text-lg text-inkdim">
        Latag Pro is a one-time unlock — no subscription, no renewal, no store fees baked into the price.
        Buy it here on the web, sign in once in the app, and it's yours for good.
      </p>
      <div className="mt-10"><Pricing detailed /></div>
    </div>
  );
}
```

- [ ] **Step 3:** `/privacy/page.tsx` — copy is binding, from the platform spec §4.4:
```tsx
import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy Policy" updated="July 13, 2026">
      <p>
        Latag is built so that we know as little about you as possible. This policy explains what little
        we collect, why, and what we never collect.
      </p>
      <h2>What never leaves your phone</h2>
      <p>
        Your inventory — sessions, items, prices, costs, profits, and every photo you take — is stored in a
        database on your device. It is never uploaded, synced, or backed up to our servers. We cannot see it,
        sell it, or hand it to anyone, because we do not have it.
      </p>
      <h2>What we collect, and why</h2>
      <ul>
        <li><strong>Account details</strong> (email address) — only if you create an account to activate a Pro license. Used solely for licensing and receipts. Encrypted in transit (TLS) and at rest.</li>
        <li><strong>Payment records</strong> — when you buy Pro, our payment provider processes the payment. We store only a reference ID, the amount, and its status. We never see or store your card number or e-wallet credentials; the provider is PCI-DSS compliant.</li>
        <li><strong>Anonymous usage counters</strong> — total items logged and active regions, as plain counts with no account, item, or photo attached. You can turn this off in the app's settings at any time.</li>
      </ul>
      <h2>What we don't do</h2>
      <ul>
        <li>No ads, no trackers, no analytics SDKs in the app.</li>
        <li>No selling or sharing of personal data with third parties.</li>
        <li>No reading your inventory — technically impossible by design.</li>
      </ul>
      <h2>Deleting your data</h2>
      <p>
        Deleting the app deletes your inventory, because your phone was the only place it existed. Your
        account (if you made one) can be deleted from the web portal at any time; this removes your email,
        license record, and any feedback you sent us. Payment references are retained only as long as
        financial regulations require.
      </p>
      <h2>Contact</h2>
      <p>Questions about this policy: hello@latag.ph.</p>
    </Prose>
  );
}
```

- [ ] **Step 4:** `/terms/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <Prose title="Terms of Use" updated="July 13, 2026">
      <p>These terms keep things fair and simple. By using Latag you agree to them.</p>
      <h2>The app</h2>
      <p>
        Latag is an offline inventory and pricing tool for clothing resellers. The free tier includes 20
        item logs. Latag Pro is a one-time purchase that unlocks unlimited logs on your account, activated by
        signing in once inside the app.
      </p>
      <h2>Your data, your responsibility</h2>
      <p>
        Because your inventory lives only on your device, you are responsible for your device. If your phone
        is lost, broken, or the app is uninstalled, your inventory cannot be recovered by us — we never had a
        copy. Your Pro license, however, is tied to your account and survives: sign in on a new device to
        restore it.
      </p>
      <h2>Purchases and refunds</h2>
      <p>
        Pro is sold on this website as a one-time payment. If Pro fails to activate on your device and we
        cannot fix it within a reasonable time, we will refund you in full. Refund requests: hello@latag.ph
        within 14 days of purchase.
      </p>
      <h2>Fair use</h2>
      <ul>
        <li>Don't attempt to circumvent the free-tier limit or resell license activations.</li>
        <li>Don't use Latag for anything unlawful.</li>
      </ul>
      <h2>Warranty and liability</h2>
      <p>
        Latag is provided as-is. We work hard to make it reliable, but we are not liable for lost profits,
        lost inventory data, or decisions made from the numbers it shows. Nothing in these terms limits
        rights you have under Philippine consumer law that cannot be waived.
      </p>
      <h2>Changes</h2>
      <p>
        If these terms change materially, the app and this site will say so before the change applies to you.
      </p>
    </Prose>
  );
}
```

- [ ] **Step 5:** `/data/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Data & Security" };

export default function DataPage() {
  return (
    <Prose title="Data & Security" updated="July 13, 2026">
      <p>
        This page is the plain-language version of our architecture: where your data lives, how it's
        protected, and the promises we build against.
      </p>
      <h2>On your phone (everything that matters)</h2>
      <ul>
        <li>Inventory, sessions, money math, and photos live in a local database and folder on your device.</li>
        <li>They are protected by your phone's built-in device encryption when you use a passcode or biometric lock.</li>
        <li>The app makes zero network calls for inventory features — flip on airplane mode and everything still works. That's not a fallback; it's the design.</li>
      </ul>
      <h2>On our servers (as little as possible)</h2>
      <ul>
        <li>Your email and Pro license status — encrypted in transit with TLS and encrypted at rest by our infrastructure provider. Used only to activate your license.</li>
        <li>A payment reference from our PCI-DSS-compliant payment provider. Card and e-wallet credentials never touch our servers.</li>
        <li>Anonymous counters (items logged, active regions) with an in-app opt-out. No item data, no photos, no names — counts only.</li>
      </ul>
      <h2>Our standing promises</h2>
      <ul>
        <li>Any future feature that would move inventory off your device will be opt-in, end-to-end encrypted, and announced on this page before it ships.</li>
        <li>Account deletion is self-serve and complete.</li>
        <li>We will never sell personal data.</li>
      </ul>
      <h2>Security contact</h2>
      <p>
        Found a vulnerability? Email hello@latag.ph with the details — we read every report and credit
        fixes if you'd like.
      </p>
    </Prose>
  );
}
```

- [ ] **Step 6:** Verify build; every page renders; footer/header links resolve. Commit: `feat(web): pro page + privacy, terms, data pages`

---

### Task 7: SEO + robots/sitemap + final gate

**Files:** Create `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`; modify `apps/web/app/layout.tsx` (OG metadata)

- [ ] **Step 1:** `app/sitemap.ts`:
```ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://latag.ph";
  return ["", "/pro", "/privacy", "/terms", "/data"].map((p) => ({ url: `${base}${p}`, lastModified: new Date("2026-07-13") }));
}
```
`app/robots.ts`:
```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: "https://latag.ph/sitemap.xml" };
}
```

- [ ] **Step 2:** Add to layout `metadata`: `openGraph: { title: "Latag — the ukay ops console", description: "Log fast. Know your margins. Work offline.", url: "https://latag.ph", siteName: "Latag", type: "website" }`.

- [ ] **Step 3:** Final gate: `pnpm web:build` → all routes static; `pnpm -C apps/web exec tsc --noEmit` → 0; mobile suite unaffected (`pnpm -C apps/mobile test` → still green). Commit: `feat(web): seo, sitemap, robots — B1 complete`

---

## Phase B2 prerequisites (user actions — gather while B1 ships)

1. **Supabase project** (free tier): supabase.com → New project → note the URL + anon key + service-role key. Powers portal auth + licenses/feedback tables + admin.
2. **Payment provider decision:** create sandbox accounts at **PayMongo** and/or **Xendit** (both need PH business/individual verification — start early, verification takes days). B2's plan finalizes the pick.
3. **Domain:** `latag.ph` is referenced by the app and this site — register it (or tell us the real domain and we'll re-point copy before launch).
4. **Vercel account** (free hobby tier) for deployment — B1 can deploy the moment you have it.

## Self-Review (performed)

- **Spec coverage:** platform spec §4.1 landing ✓ (Task 5), §4.4 legal ✓ (Task 6, binding copy incl. encryption commitments and banned-overpromise rule), `/pro` referenced by mobile ✓ (Task 6), monolith-in-monorepo ✓ (Task 1); §4.2/4.3/4.5 (portal/admin/APIs) explicitly deferred to B2 with prerequisites listed.
- **Placeholder scan:** none — full copy and code in every step.
- **Type consistency:** component names/props match across Tasks 3–6 (`CtaButton`, `Badge`, `SectionTitle`, `CheckItem`, `Pricing({detailed})`, `Prose({title,updated})`, `PhoneDemo()`).
