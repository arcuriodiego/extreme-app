import { COUNTER_METHODS, PAYMENT_METHOD_LABELS } from "@/domain/billing/payments";

const input = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

/** Campos de un cobro: el importe es siempre el total (no hay pagos parciales); se elige medio y referencia. */
export function PaymentFields({ idPrefix, defaultPesos }: { idPrefix: string; defaultPesos: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[140px_1fr_1fr]">
      <input type="hidden" name="amount" value={defaultPesos} />
      <div className="flex flex-col gap-1 text-sm font-semibold">
        Total a cobrar
        <span className="flex h-10 items-center text-lg font-bold">${defaultPesos}</span>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor={`${idPrefix}-medio`}>
        Medio
        <select id={`${idPrefix}-medio`} name="method" required defaultValue="cash" className={input}>
          {COUNTER_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor={`${idPrefix}-ref`}>
        <span>
          N° de operación <span className="font-normal text-muted">(opcional)</span>
        </span>
        <input id={`${idPrefix}-ref`} name="reference" maxLength={80} className={input} />
      </label>
    </div>
  );
}

/** "$55.500" → "55.500" para precargar el campo. */
export function pesosText(cents: number): string {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = cents % 100;
  return fraction === 0 ? whole : `${whole},${String(fraction).padStart(2, "0")}`;
}
