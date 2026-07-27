import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://latag.vercel.app"),
  title: { default: "Latag — ukay inventory and your own shop page", template: "%s · Latag" },
  description:
    "Run your whole ukay inventory offline — every department, every measurement, 469 PH ukay brands built in. Publish the items you choose to a shop page buyers can browse. Costs and margins never leave your phone.",
  openGraph: {
    title: "Latag — ukay inventory and your own shop page",
    description: "Every piece you own in one offline inventory. One link buyers can browse.",
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
