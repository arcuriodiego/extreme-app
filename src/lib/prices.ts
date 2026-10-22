import "server-only";
import { nextChange, type PriceEntry, priceOn } from "@/domain/billing/prices";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface PlanWithPrices {
  id: string;
  kind: "teacher_monthly" | "pack" | "single_class";
  name: string;
  description: string;
  active: boolean;
  prices: PriceEntry[];
  current: PriceEntry | null;
  next: PriceEntry | null;
}

function describe(p: { kind: string; classes_per_week: number | null; class_count: number | null; has_grace: boolean }): string {
  if (p.kind === "teacher_monthly") return `${p.classes_per_week} clases por semana con tu profe · 1 mes${p.has_grace ? " · 5 días de gracia" : ""}`;
  if (p.kind === "pack") return `${p.class_count} clases con cualquier profe y estilo · 1 mes`;
  return "Una clase";
}

export async function loadPlans(supabase: Client, today: string): Promise<PlanWithPrices[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, kind, name, classes_per_week, class_count, has_grace, active, sort_order, prices:plan_prices(id, amount_cents, valid_from)")
    .order("sort_order");
  if (error) throw new Error(`No se pudieron cargar los planes: ${error.message}`);
  return (data ?? []).map((p) => {
    const prices: PriceEntry[] = ((p.prices ?? []) as { id: string; amount_cents: number; valid_from: string }[])
      .map((x) => ({ id: x.id, amountCents: Number(x.amount_cents), validFrom: x.valid_from }))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
    return {
      id: p.id as string,
      kind: p.kind as PlanWithPrices["kind"],
      name: p.name as string,
      description: describe(p as { kind: string; classes_per_week: number | null; class_count: number | null; has_grace: boolean }),
      active: p.active as boolean,
      prices,
      current: priceOn(prices, today),
      next: nextChange(prices, today),
    };
  });
}
