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
