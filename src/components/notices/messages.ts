export const SEND_ERRORS: Record<string, string> = {
  destino: "Elegí a quién va el aviso.",
  titulo: "Escribí un título de hasta 120 letras.",
  mensaje: "El mensaje puede tener hasta 1000 letras.",
  "sin-permiso": "No podés enviar avisos a ese grupo.",
  generico: "No pudimos enviar el aviso. Probá de nuevo.",
};

export function sentNotice(n: string | undefined): string {
  const count = Number(n ?? 0);
  if (!Number.isFinite(count) || count === 0) {
    return "Listo, guardamos el aviso. Nadie lo recibió todavía: los alumnos de ese grupo no tienen cuenta ni tutor con cuenta.";
  }
  return `Listo, enviamos el aviso. Llegó a ${count} ${count === 1 ? "persona" : "personas"}.`;
}
