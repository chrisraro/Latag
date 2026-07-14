import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://latag.vercel.app"),
  title: { default: "Latag — the ukay ops console", template: "%s · Latag" },
  description:
    "Log a piece in 5 seconds, know your margins instantly, and drop to Instagram in one tap. 100% offline — built for ukay-ukay resellers.",
  openGraph: {
    title: "Latag — the ukay ops console",
    description: "Log fast. Know your margins. Work offline.",
    url: "https://latag.vercel.app",
    siteName: "Latag",
    type: "website",
  },
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
            <Link className="hover:text-ink focus-visible:text-ink" href="/account">Account</Link>
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
