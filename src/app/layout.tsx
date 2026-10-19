import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { academyConfig } from "@/config/academy";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: academyConfig.name, template: `%s · ${academyConfig.shortName}` },
  description: `Clases, pases y pagos de ${academyConfig.name}.`,
  applicationName: academyConfig.shortName,
  appleWebApp: { capable: true, title: academyConfig.shortName, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: academyConfig.colors.paper,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
