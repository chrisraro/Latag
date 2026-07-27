import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";

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
        {/* Marketing chrome. Storefronts are the seller's page and render their
            own nav/footer, so SiteChrome stands itself down on /shop/*. */}
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
