import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import { site } from "@/content/site";
import { getSiteAsset } from "@/lib/site-assets";
import "./globals.css";

// PENDENTE: fonte da marca. Provisório: Inter (texto) + Bebas Neue (títulos).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: site.meta.title,
    template: `%s | ${site.brand.name}`,
  },
  description: site.meta.description,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: site.brand.name,
    title: site.meta.title,
    description: site.meta.description,
    // PENDENTE: og-image real (PNG 1200×630). WhatsApp não renderiza SVG no preview.
    images: [{ url: getSiteAsset("og-image"), width: 1200, height: 630, alt: site.meta.ogAlt }],
  },
  twitter: {
    card: "summary_large_image",
    title: site.meta.title,
    description: site.meta.description,
    images: [getSiteAsset("og-image")],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: site.theme.background,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${bebas.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-ink"
        >
          {site.nav.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
