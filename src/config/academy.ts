/**
 * Identidad de la academia. Es lo único que dice "Extreme Dance" en el código:
 * la lógica no depende del nombre, así la app puede ofrecerse a otras academias.
 */
export const academyConfig = {
  slug: "extreme-dance",
  name: "Extreme Dance Academy",
  shortName: "Extreme Dance",
  timeZone: "America/Argentina/Buenos_Aires",
  locale: "es-AR",
  currency: "ARS",
  colors: {
    brand: "#D90000",
    ink: "#111111",
    paper: "#FFFFFF",
  },
  logo: {
    light: "/brand/logo.png",
    width: 2172,
    height: 724,
  },
} as const;
