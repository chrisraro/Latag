import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { JsonLd } from "../components/JsonLd";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { organizationJsonLd, websiteJsonLd } from "../lib/structured-data";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://latag.vercel.app"),
  title: { default: "Latag — ukay inventory and your own shop page", template: "%s · Latag" },
  // Kept under ~155 characters so Google doesn't truncate it in the SERP.
  description:
    "Offline-first inventory and storefront tool for PH ukay resellers. Free forever, with a paid Pro storefront.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Latag — ukay inventory and your own shop page",
    description: "Every piece you own in one offline inventory. One link buyers can browse.",
    url: "https://latag.vercel.app",
    siteName: "Latag",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Latag — ukay inventory and your own shop page",
    description: "Every piece you own in one offline inventory. One link buyers can browse.",
  },
};

// Dark-only theme — see DESIGN.md's `bg` token (`#000000`, OLED black).
export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
        {/* Marketing chrome. Storefronts are the seller's page and render their
            own nav/footer, so SiteChrome stands itself down on /shop/*. */}
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
