import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, SmallSubmit, TextField } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { formatARS } from "@/domain/shared/money";
import { nonCashPrice } from "@/domain/billing/cash-price";
import { addDays } from "@/domain/shared/calendar-date";
import { academyToday } from "@/lib/grilla";
import { loadPlans } from "@/lib/prices";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { removePrice, saveRules, setPrice } from "./actions";
import { EDITABLE_RULES, RULE_GROUPS } from "@/domain/settings/rules";

export const metadata: Metadata = { title: "Configuración" };

const NOTICES: Record<string, string> = {
  "precio-guardado": "Listo, guardamos el precio. Rige desde la fecha que elegiste.",
  "precio-quitado": "Listo, quitamos el precio programado.",
  "reglas-sin-cambios": "No cambiaste ninguna regla.",
};
const ERRORS: Record<string, string> = {
  monto: "Escribí el importe en pesos, por ejemplo 55.500.",
  fecha: "Elegí desde qué fecha rige.",
  "fecha-pasada": "Un precio no puede empezar en una fecha pasada.",
  "no-disponible": "Ese precio ya empezó a regir: no se puede quitar. Cargá uno nuevo.",
  "sin-permiso": "No tenés permiso para cambiar precios.",
  datos: "Revisá los datos.",
  generico: "No pudimos guardar el cambio. Probá de nuevo.",
  reglas: "No pudimos guardar las reglas. Revisá los valores y probá de nuevo.",
};

function ruleError(key: string | undefined, kind: string | undefined): string {
  const rule = EDITABLE_RULES.find((r) => r.key === key);
  if (!rule) return "Revisá las reglas.";
  if (kind === "credito") return "La clase del crédito tiene que poder ser al menos hasta el último día para reservarla.";
  if (kind === "numero") return `"${rule.label}": escribí un número entero.`;
  return `"${rule.label}" tiene que estar entre ${rule.min} y ${rule.max}.`;
}


const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDate = (d: string) => dateFormat.format(new Date(`${d}T12:00:00Z`)).replace(".", "");

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string; k?: string; e?: string; n?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "configuracion")) return <NoAccess />;

  const today = academyToday();
  const supabase = await createClient();
  const [plans, { data: settings }] = await Promise.all([
    loadPlans(supabase, today),
    supabase.from("app_settings").select("key, value, updated_at, updated_by"),
  ]);
  const notice =
    params.aviso === "reglas-guardadas"
      ? `Listo, guardamos ${params.n === "1" ? "la regla" : `${params.n ?? ""} reglas`}. Rigen desde ahora.`
      : params.aviso
        ? NOTICES[params.aviso]
        : undefined;
  const failure = params.error === "regla" ? ruleError(params.k, params.e) : params.error ? ERRORS[params.error] : undefined;
  type SettingRow = {
    key: string;
    value: number;
    updated_at: string;
    updated_by: string | null;
  };
  const rows = (settings ?? []) as unknown as SettingRow[];
  const valueOf = (key: string) => rows.find((r) => r.key === key)?.value;
  const surcharge = valueOf("non_cash_surcharge_pct") ?? 0;
  const lastEdit = rows.filter((r) => r.updated_by).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const editor = lastEdit?.updated_by
    ? ((await supabase.from("profiles").select("first_name, last_name").eq("id", lastEdit.updated_by).maybeSingle()).data as {
        first_name: string | null;
        last_name: string | null;
      } | null)
    : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Configuración" subtitle="Precios y reglas de la academia." />
<span className="flex flex-wrap gap-4">
          <Link href="/admin/configuracion/notificaciones" className="text-sm font-semibold">
            Notificaciones al celular
          </Link>
          <Link href="/admin/diagnostico" className="text-sm font-semibold">
            Diagnóstico de velocidad
          </Link>
        </span>
      </div>
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Precios</h2>
        <p className="text-[15px] text-muted">
          Se carga el precio en efectivo; con transferencia, QR, tarjeta o la app se cobra ese precio más el recargo de las reglas (hoy{" "}
          {surcharge} %). Un aumento se programa desde una fecha. Lo ya cobrado o emitido no cambia.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => (
            <article key={plan.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-5">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide">{plan.name}</h3>
                <p className="text-sm text-muted">{plan.description}</p>
              </div>
              <p className="flex items-baseline justify-between">
                <span className="text-[15px]">Precio en efectivo</span>
                <strong className="font-display text-3xl">{plan.current ? formatARS(plan.current.amountCents) : "Sin precio"}</strong>
              </p>
              {plan.current && surcharge > 0 && (
                <p className="-mt-2 flex items-baseline justify-between text-sm text-muted">
                  <span>Con otros medios (+{surcharge} %)</span>
                  <strong>{formatARS(nonCashPrice(plan.current.amountCents, surcharge))}</strong>
                </p>
              )}
              {plan.prices.filter((p) => p.validFrom > today).length > 0 && (
                <ul className="flex flex-col gap-1.5 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink">
                  {plan.prices
                    .filter((p) => p.validFrom > today)
                    .reverse()
                    .map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span>
                          Desde el {shortDate(p.validFrom)}: <strong>{formatARS(p.amountCents)}</strong>
                          {surcharge > 0 ? ` en efectivo · ${formatARS(nonCashPrice(p.amountCents, surcharge))} otros medios` : ""}
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
                    <TextField name="amount" label="Precio en efectivo" inputMode="numeric" required hint="Ej.: 56.000. Con otros medios se suma el recargo." />
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

      <section id="reglas" className="flex scroll-mt-6 flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Reglas</h2>
        <p className="text-[15px] text-muted">
          Cambian cómo funciona la app para todos. Cada cambio queda registrado con quién lo hizo.
          {lastEdit
            ? ` Último cambio: ${new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(lastEdit.updated_at))}${
                editor ? ` · ${[editor.first_name, editor.last_name].filter(Boolean).join(" ")}` : ""
              }.`
            : ""}
        </p>
        <form action={saveRules} className="flex max-w-3xl flex-col gap-6">
          {RULE_GROUPS.map((g) => (
            <fieldset key={g.title} className="flex flex-col">
              <legend className="pb-1 font-semibold">{g.title}</legend>
              {g.rules.map((r) => (
                <div key={r.key} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
                  <label htmlFor={`regla-${r.key}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{r.label}</span>
                    <span className="text-sm text-muted">{r.help}</span>
                  </label>
                  <span className="flex shrink-0 items-center gap-2">
                    <input
                      id={`regla-${r.key}`}
                      name={r.key}
                      type="number"
                      inputMode="numeric"
                      min={r.min}
                      max={r.max}
                      step={1}
                      required
                      defaultValue={valueOf(r.key)}
                      className="h-10 w-20 rounded-xl border border-[#cfcfcf] bg-white px-3 text-right text-base outline-none focus:border-ink"
                    />
                    <span className="w-28 text-sm text-muted">{r.unit}</span>
                  </span>
                </div>
              ))}
            </fieldset>
          ))}
          <div>
            <SmallSubmit tone="dark">Guardar reglas</SmallSubmit>
          </div>
        </form>
      </section>
    </>
  );
}
