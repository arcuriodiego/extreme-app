import { appEnv, appUrl } from "@/domain/env/app-env";

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
  /** Dirección pública de la app (enlaces de los emails). En pruebas, la de pruebas. */
  appUrl: appUrl(process.env.NEXT_PUBLIC_APP_URL),
  /** Producción o pruebas (staging). */
  env: appEnv(process.env.NEXT_PUBLIC_APP_ENV),
  /** Remitente de los emails (dominio verificado en Resend). */
  emailFrom: "Extreme Dance Academy <hola@extremedance.com.ar>",
  /** Las respuestas a los emails de avisos llegan al Gmail de la academia. */
  emailReplyTo: "academyextremedance@gmail.com",
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
