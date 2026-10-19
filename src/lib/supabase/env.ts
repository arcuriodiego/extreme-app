/**
 * Datos de conexión públicos de Supabase.
 * Se leen al usarse (no al cargar el módulo) para que la compilación funcione
 * aunque las variables no estén definidas en ese entorno.
 */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const env = supabaseEnv();
  if (!env) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Cargalas en Vercel (Settings → Environment Variables) o en .env.local.",
    );
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/.test(env.url) && !env.url.startsWith("http://127.0.0.1")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL no tiene el formato esperado (https://<proyecto>.supabase.co).");
  }
  return env;
}
