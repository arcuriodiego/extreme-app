import type { MetadataRoute } from "next";
import { academyConfig } from "@/config/academy";
import { installName } from "@/domain/env/app-env";

// Hace que la app se pueda instalar en el celular (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: academyConfig.env === "staging" ? `${academyConfig.name} (pruebas)` : academyConfig.name,
    short_name: installName(academyConfig.shortName, academyConfig.env),
    lang: academyConfig.locale,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: academyConfig.colors.paper,
    theme_color: academyConfig.colors.paper,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
