import Link from "next/link";

/**
 * Covers both a handle that does not exist and an item code that does not —
 * including the item a seller just unpublished, which is the common case and
 * should read as "gone", not "broken".
 */
export default function ShopNotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-5xl flex-col justify-center overflow-x-hidden px-5 py-20 md:py-28">
      <h1 className="display text-3xl text-ink sm:text-4xl">This page isn&apos;t here.</h1>
      <p className="mt-4 max-w-[48ch] text-inkdim">
        The shop or item may have been unpublished, or the link may be mistyped.
      </p>
      <Link
        href="/"
        className="display mt-8 inline-flex h-12 w-fit items-center justify-center rounded-full bg-acid px-6 text-[14px] uppercase tracking-wide text-acidink"
      >
        See what Latag is
      </Link>
    </div>
  );
}
