"use server";

import { redirect } from "next/navigation";
import { parsePesos } from "@/domain/billing/prices";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BACK = "/admin/configuracion";

function to(params: Record<string, string>): never {
  redirect(`${BACK}?${new URLSearchParams(params).toString()}`);
}

function code(error: { code?: string }): string {
  if (error.code === "42501") return "sin-permiso";
  if (error.code === "22023") return "fecha-pasada";
  if (error.code === "P0002") return "no-disponible";
  return "generico";
}

export async function setPrice(formData: FormData): Promise<void> {
  const planId = String(formData.get("plan_id") ?? "");
  const amount = parsePesos(formData.get("amount"));
  const validFrom = String(formData.get("valid_from") ?? "");
  if (!UUID.test(planId)) to({ error: "datos" });
  if (amount === null) to({ error: "monto" });
  if (!DATE.test(validFrom)) to({ error: "fecha" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_plan_price", { p_plan_id: planId, p_amount_cents: amount, p_valid_from: validFrom });
  if (error) to({ error: code(error) });
  to({ aviso: "precio-guardado" });
}

export async function removePrice(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) to({ error: "datos" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_plan_price", { p_price_id: id });
  if (error) to({ error: code(error) });
  to({ aviso: "precio-quitado" });
}
