import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { academyConfig } from "@/config/academy";
import { installName } from "@/domain/env/app-env";
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
  appleWebApp: { capable: true, title: installName(academyConfig.shortName, academyConfig.env), statusBarStyle: "default" },
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
      <body className="min-h-dvh antialiased">
        {children}
        {academyConfig.env === "staging" && (
          // Para no confundir la app de pruebas con la real.
          <div
            aria-hidden="true"
            className="pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 rounded-full bg-warn-soft px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-warn-ink shadow-sm"
            style={{ top: "calc(env(safe-area-inset-top) + 4px)" }}
          >
            PRUEBAS
          </div>
        )}
      </body>
    </html>
  );
}
