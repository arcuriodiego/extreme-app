import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface Regulation {
  id: string;
  version: number;
  title: string;
  body: string;
  publishedAt: string;
}

/** Reglamento vigente (la última versión) o null si todavía no se cargó. */
export async function loadCurrentRegulation(supabase: Client): Promise<Regulation | null> {
  const { data } = await supabase.from("regulations").select("id, version, title, body, published_at").order("version", { ascending: false }).limit(1).maybeSingle();
  const r = data as { id: string; version: number; title: string; body: string; published_at: string } | null;
  return r ? { id: r.id, version: r.version, title: r.title, body: r.body, publishedAt: r.published_at } : null;
}

/** Cuándo aceptó esta cuenta la versión vigente (null si no la aceptó). */
export async function myAcceptance(supabase: Client, regulationId: string, profileId: string): Promise<string | null> {
  const { data } = await supabase
    .from("regulation_acceptances")
    .select("accepted_at")
    .eq("regulation_id", regulationId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return (data as { accepted_at: string } | null)?.accepted_at ?? null;
}

/** ¿Hay un reglamento vigente sin aceptar por esta cuenta? */
export async function regulationPending(supabase: Client): Promise<boolean> {
  const { data } = await supabase.rpc("regulation_accepted");
  return data === false;
}

export async function loadRegulationHistory(supabase: Client): Promise<(Regulation & { accepted: number })[]> {
  const [{ data }, { data: acc }] = await Promise.all([
    supabase.from("regulations").select("id, version, title, body, published_at").order("version", { ascending: false }).limit(20),
    supabase.from("regulation_acceptances").select("regulation_id"),
  ]);
  const counts = new Map<string, number>();
  for (const a of (acc ?? []) as { regulation_id: string }[]) counts.set(a.regulation_id, (counts.get(a.regulation_id) ?? 0) + 1);
  return ((data ?? []) as { id: string; version: number; title: string; body: string; published_at: string }[]).map((r) => ({
    id: r.id,
    version: r.version,
    title: r.title,
    body: r.body,
    publishedAt: r.published_at,
    accepted: counts.get(r.id) ?? 0,
  }));
}

/** Aceptaciones de un conjunto de cuentas (para la ficha: el alumno y sus tutores). */
export async function acceptancesOf(supabase: Client, profileIds: readonly string[]): Promise<Map<string, { version: number; acceptedAt: string }>> {
  const map = new Map<string, { version: number; acceptedAt: string }>();
  if (profileIds.length === 0) return map;
  const { data } = await supabase
    .from("regulation_acceptances")
    .select("profile_id, accepted_at, regulation:regulations(version)")
    .in("profile_id", [...profileIds])
    .order("accepted_at", { ascending: false });
  for (const r of (data ?? []) as unknown as { profile_id: string; accepted_at: string; regulation: { version: number } | null }[]) {
    if (!map.has(r.profile_id)) map.set(r.profile_id, { version: r.regulation?.version ?? 0, acceptedAt: r.accepted_at });
  }
  return map;
}
