import Link from "next/link";

/**
 * Storefront chrome. The nav is the web echo of the mobile floating tab bar —
 * a blurred pill that floats over the grid rather than a marketing header bar,
 * because on this page the seller is the brand and Latag is the footnote.
 */

function LatagMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <g transform="translate(256,256) rotate(-12)">
        <path d="M -125,0 L -38,-81 L -28.1,-81 L -11.9,81 L -38,81 Z" fill="#B8F135" />
        <rect x="-100" y="-19" width="38" height="38" fill="#000" />
        <path d="M -10.1,-81 L 125,-81 L 125,81 L 6.1,81 Z" fill="#B8F135" />
        <rect x="6" y="-56" width="38" height="112" fill="#000" />
        <rect x="6" y="19" width="75" height="37" fill="#000" />
      </g>
    </svg>
  );
}

export function ShopNav({ handle, back }: { handle: string; back?: boolean }) {
  return (
    <div className="sticky top-0 z-50 flex justify-center px-4 pt-4">
      <nav
        aria-label="Storefront"
        className="flex w-full max-w-5xl items-center justify-between gap-3 rounded-full border border-hairline bg-white/5 px-4 py-2.5 backdrop-blur-xl"
      >
        <Link
          href={`/shop/${handle}`}
          className="flex min-h-11 items-center gap-2 rounded-full pr-2 text-ink"
          aria-label={`${handle} storefront home`}
        >
          <LatagMark />
          <span className="display text-[13px] uppercase tracking-wide text-inkdim">
            {handle}
          </span>
        </Link>
        {back ? (
          <Link
            href={`/shop/${handle}`}
            className="display flex min-h-11 items-center rounded-full px-3 text-[12px] uppercase tracking-wide text-inkdim hover:text-ink"
          >
            All items
          </Link>
        ) : (
          <span className="display px-3 text-[12px] uppercase tracking-wide text-inkfaint">
            Shop
          </span>
        )}
      </nav>
    </div>
  );
}

export function ShopFooter() {
  return (
    <footer className="mx-auto max-w-5xl border-t border-hairline px-5 py-10">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2.5 text-sm text-inkfaint hover:text-inkdim"
      >
        <LatagMark className="h-5 w-5" />
        <span>
          Made with <span className="display text-acid">Latag</span>
        </span>
      </Link>
    </footer>
  );
}
