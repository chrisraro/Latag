"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The marketing header/footer, suppressed on `/shop/*`.
 *
 * A seller's storefront is their page, not Latag's: showing buyers a "Get Pro"
 * nav there would be selling the wrong product to the wrong person. Those routes
 * render their own floating pill nav and a single "Made with Latag" footer,
 * which is the growth loop the spec actually asks for.
 *
 * `usePathname` resolves during SSR in the App Router, so there is no flash of
 * the wrong chrome — this is a render-time branch, not a post-hydration one.
 */
function isStorefront(pathname: string | null): boolean {
  return pathname?.startsWith("/shop/") ?? false;
}

export function SiteHeader() {
  const pathname = usePathname();
  if (isStorefront(pathname)) return null;

  // Wraps rather than overflows: logo + four nav targets do not fit on a 390px
  // viewport at any sane gap, so the nav drops to its own line instead.
  return (
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-5 sm:px-6">
      <Link href="/" className="flex items-center gap-2.5">
        <svg viewBox="0 0 512 512" className="h-7 w-7" aria-hidden="true">
          <g transform="translate(256,256) rotate(-12)">
            <path d="M -125,0 L -38,-81 L -28.1,-81 L -11.9,81 L -38,81 Z" fill="#B8F135" />
            <rect x="-100" y="-19" width="38" height="38" fill="#000" />
            <path d="M -10.1,-81 L 125,-81 L 125,81 L 6.1,81 Z" fill="#B8F135" />
            <rect x="6" y="-56" width="38" height="112" fill="#000" />
            <rect x="6" y="19" width="75" height="37" fill="#000" />
          </g>
        </svg>
        <span className="display-black text-xl uppercase tracking-wide text-acid">Latag</span>
      </Link>
      <nav aria-label="Main" className="flex items-center gap-4 text-sm text-inkdim sm:gap-5">
        <Link className="hover:text-ink focus-visible:text-ink" href="/pro">Pricing</Link>
        <Link className="hover:text-ink focus-visible:text-ink" href="/data">Data</Link>
        <Link className="hover:text-ink focus-visible:text-ink" href="/account">Account</Link>
        <Link
          href="/pro"
          className="display rounded-full bg-acid px-4 py-2 text-[13px] uppercase tracking-wide text-acidink"
        >
          Get Pro
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (isStorefront(pathname)) return null;

  return (
    <footer className="mx-auto mt-24 max-w-6xl border-t border-hairline px-5 py-10 text-sm text-inkfaint sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} Latag · Made for the ukay grind</p>
        <nav aria-label="Legal" className="flex gap-5">
          <Link className="hover:text-inkdim" href="/privacy">Privacy</Link>
          <Link className="hover:text-inkdim" href="/terms">Terms</Link>
          <Link className="hover:text-inkdim" href="/data">Data &amp; Security</Link>
        </nav>
      </div>
    </footer>
  );
}
