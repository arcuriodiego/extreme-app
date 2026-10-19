import type { MetadataRoute } from "next";
import { academyConfig } from "@/config/academy";

// Hace que la app se pueda instalar en el celular (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: academyConfig.name,
    short_name: academyConfig.shortName,
    lang: academyConfig.locale,
    start_url: "/",
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
