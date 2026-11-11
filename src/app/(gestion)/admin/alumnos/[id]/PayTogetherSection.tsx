import { SmallSubmit } from "@/components/forms/fields";
import { COUNTER_METHODS, PAYMENT_METHOD_LABELS } from "@/domain/billing/payments";
import { formatARS } from "@/domain/shared/money";
import { payTogether } from "../actions";

const input = "h-10 min-w-0 rounded-xl border border-edge bg-paper px-3 text-base outline-none focus:border-ink";

interface FamilyCharge {
  id: string;
  studentName: string;
  description: string;
  dueDate: string;
  pendingCents: number;
  cashCents: number | null;
}

/**
 * Cobrar varias cuotas en un solo pago (por ejemplo, de hermanos): sale un único recibo.
 * Cada cuota se cobra completa; en efectivo, a su precio en efectivo.
 */
export function PayTogetherSection({ studentId, charges }: { studentId: string; charges: FamilyCharge[] }) {
  if (charges.length < 2) return null;
  const fmt = (d: string) => d.split("-").reverse().join("/");
  const cashTotal = charges.reduce((s, c) => s + (c.cashCents ?? c.pendingCents), 0);
  const listTotal = charges.reduce((s, c) => s + c.pendingCents, 0);
  const siblings = new Set(charges.map((c) => c.studentName)).size > 1;

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Cobrar cuotas juntas</h2>
      <p className="text-[15px] text-muted">
        {siblings ? "Cuotas pendientes de la familia (hermanos con el mismo tutor)." : "Cuotas pendientes."} Tildá las que paga ahora: sale un solo
        recibo con todas.
      </p>
      <form action={payTogether} className="flex max-w-2xl flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
        <input type="hidden" name="student_id" value={studentId} />
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Cuotas</legend>
          {charges.map((c) => (
            <label key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
              <input type="checkbox" name="charge_id" value={c.id} defaultChecked className="size-5 accent-ink" />
              <span className="flex flex-1 flex-col">
                <span className="text-[15px] font-semibold">
                  {c.studentName} · {c.description}
                </span>
                <span className="text-sm text-muted">Vence el {fmt(c.dueDate)}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <strong>{formatARS(c.pendingCents)}</strong>
                {c.cashCents !== null && <span className="text-sm text-muted">efectivo {formatARS(c.cashCents)}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted">
          Todas juntas: {formatARS(listTotal)}
          {cashTotal !== listTotal ? ` · en efectivo ${formatARS(cashTotal)}` : ""}. Si destildás alguna, el total baja.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Medio de pago
            <select name="method" required defaultValue="" className={input}>
              <option value="" disabled>
                Elegí…
              </option>
              {COUNTER_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            <span>
              N° de operación <span className="font-normal text-muted">(opcional)</span>
            </span>
            <input name="reference" maxLength={80} className={input} />
          </label>
        </div>
        <div>
          <SmallSubmit tone="dark">Cobrar y hacer un recibo</SmallSubmit>
        </div>
      </form>
    </section>
  );
}
