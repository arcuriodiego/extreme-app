import type { Metadata } from "next";
import { FormAlert, SmallSubmit, TextField } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { formatARS } from "@/domain/shared/money";
import { addDays } from "@/domain/shared/calendar-date";
import { academyToday } from "@/lib/grilla";
import { loadPlans } from "@/lib/prices";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { removePrice, setPrice } from "./actions";

export const metadata: Metadata = { title: "Configuración" };

const NOTICES: Record<string, string> = {
  "precio-guardado": "Listo, guardamos el precio. Rige desde la fecha que elegiste.",
  "precio-quitado": "Listo, quitamos el precio programado.",
};
const ERRORS: Record<string, string> = {
  monto: "Escribí el importe en pesos, por ejemplo 55.500.",
  fecha: "Elegí desde qué fecha rige.",
  "fecha-pasada": "Un precio no puede empezar en una fecha pasada.",
  "no-disponible": "Ese precio ya empezó a regir: no se puede quitar. Cargá uno nuevo.",
  "sin-permiso": "No tenés permiso para cambiar precios.",
  datos: "Revisá los datos.",
  generico: "No pudimos guardar el cambio. Probá de nuevo.",
};

const RULES: Record<string, { label: string; unit: string }> = {
  grace_days: { label: "Gracia de la cuota de profe", unit: "días" },
  due_reminder_days: { label: "Aviso antes del vencimiento", unit: "días antes" },
  suspension_alert_days: { label: "Alerta para decidir la baja tras la suspensión", unit: "días" },
  cancel_hours: { label: "Anticipación para cancelar sin perder la clase", unit: "horas" },
  credit_days: { label: "Vigencia del crédito para reservar", unit: "días" },
  credit_class_window_days: { label: "La clase del crédito puede ser hasta", unit: "días después" },
  booking_hold_minutes: { label: "Lugar guardado sin pagar", unit: "minutos" },
  session_generation_weeks: { label: "Clases generadas por adelantado", unit: "semanas" },
};

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDate = (d: string) => dateFormat.format(new Date(`${d}T12:00:00Z`)).replace(".", "");

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "configuracion")) return <NoAccess />;

  const today = academyToday();
  const supabase = await createClient();
  const [plans, { data: settings }] = await Promise.all([
    loadPlans(supabase, today),
    supabase.from("app_settings").select("key, value"),
  ]);
  const notice = params.aviso ? NOTICES[params.aviso] : undefined;
  const failure = params.error ? ERRORS[params.error] : undefined;

  return (
    <>
      <PageHeader title="Configuración" subtitle="Precios y reglas de la academia." />
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Precios</h2>
        <p className="text-[15px] text-muted">
          Un aumento se programa desde una fecha. Lo ya cobrado o emitido no cambia: cada cuota guarda el precio con el que se emitió.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => (
            <article key={plan.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-5">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide">{plan.name}</h3>
                <p className="text-sm text-muted">{plan.description}</p>
              </div>
              <p className="flex items-baseline justify-between">
                <span className="text-[15px]">Precio actual</span>
                <strong className="font-display text-3xl">{plan.current ? formatARS(plan.current.amountCents) : "Sin precio"}</strong>
              </p>
              {plan.prices.filter((p) => p.validFrom > today).length > 0 && (
                <ul className="flex flex-col gap-1.5 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink">
                  {plan.prices
                    .filter((p) => p.validFrom > today)
                    .reverse()
                    .map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span>
                          Desde el {shortDate(p.validFrom)}: <strong>{formatARS(p.amountCents)}</strong>
                        </span>
                        <form action={removePrice}>
                          <input type="hidden" name="id" value={p.id} />
                          <SmallSubmit tone="danger">Quitar</SmallSubmit>
                        </form>
                      </li>
                    ))}
                </ul>
              )}
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Programar un precio nuevo</summary>
                <form action={setPrice} className="flex flex-col gap-3 pt-3">
                  <input type="hidden" name="plan_id" value={plan.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField name="amount" label="Importe en pesos" inputMode="numeric" required hint="Ej.: 60.000" />
                    <TextField name="valid_from" label="Rige desde" type="date" required defaultValue={addDays(today, 1)} />
                  </div>
                  <div>
                    <SmallSubmit tone="dark">Guardar precio</SmallSubmit>
                  </div>
                </form>
              </details>
              {plan.prices.filter((p) => p.validFrom <= today).length > 1 && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">Historial</summary>
                  <ul className="flex flex-col gap-1 pt-2 text-sm text-muted">
                    {plan.prices
                      .filter((p) => p.validFrom <= today)
                      .map((p) => (
                        <li key={p.id}>
                          Desde el {shortDate(p.validFrom)}: {formatARS(p.amountCents)}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Reglas</h2>
        <p className="text-[15px] text-muted">Los valores aprobados. Por ahora se cambian a pedido; más adelante, desde acá.</p>
        <ul className="flex max-w-2xl flex-col">
          {Object.entries(RULES).map(([key, rule]) => {
            const value = (settings ?? []).find((s) => s.key === key)?.value;
            return (
              <li key={key} className="flex items-center justify-between gap-4 border-t border-line py-2.5 text-[15px]">
                <span>{rule.label}</span>
                <strong className="shrink-0">
                  {value ?? "—"} {rule.unit}
                </strong>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
