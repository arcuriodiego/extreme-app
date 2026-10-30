/**
 * La tarea programada de Vercel llama con "Authorization: Bearer <CRON_SECRET>".
 * Sin secreto configurado (o muy corto) no se acepta ninguna llamada.
 */
export function cronAuthorized(header: string | null | undefined, secret: string | undefined): boolean {
  const s = secret?.trim() ?? "";
  if (s.length < 16 || !header) return false;
  const expected = `Bearer ${s}`;
  if (header.length !== expected.length) return false;
  // Comparación en tiempo constante.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
