/**
 * Traduce los errores de Supabase Auth a mensajes claros en español.
 * Nunca muestra el texto técnico original al usuario.
 */

export interface AuthErrorLike {
  code?: string | undefined;
  status?: number | undefined;
  message?: string | undefined;
}

const BY_CODE: Record<string, string> = {
  invalid_credentials: "El email o la contraseña no son correctos.",
  email_not_confirmed: "Tu email todavía no está confirmado. Revisá tu correo y abrí el enlace que te enviamos.",
  user_already_exists: "Ya existe una cuenta con ese email. Probá ingresar o recuperar tu contraseña.",
  email_exists: "Ya existe una cuenta con ese email. Probá ingresar o recuperar tu contraseña.",
  weak_password: "Esa contraseña es muy fácil de adivinar. Probá con otra más larga.",
  same_password: "La nueva contraseña tiene que ser distinta de la anterior.",
  over_email_send_rate_limit: "Enviamos demasiados emails en poco tiempo. Esperá unos minutos y volvé a intentar.",
  over_request_rate_limit: "Hubo demasiados intentos seguidos. Esperá unos minutos y volvé a intentar.",
  otp_expired: "El enlace venció o ya se usó. Pedí uno nuevo.",
  session_expired: "Tu sesión venció. Ingresá de nuevo.",
  signup_disabled: "Por ahora no se pueden crear cuentas nuevas.",
  user_banned: "Esta cuenta está bloqueada. Consultá en recepción.",
};

export const GENERIC_AUTH_ERROR = "No pudimos completar la operación. Probá de nuevo en unos minutos.";

export function authErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_AUTH_ERROR;
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code]!;
  if (error.status === 429) return BY_CODE.over_request_rate_limit!;
  return GENERIC_AUTH_ERROR;
}
