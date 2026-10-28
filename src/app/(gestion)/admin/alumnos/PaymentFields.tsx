import { MethodTotal } from "./MethodTotal";

const input = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

/**
 * Campos de un cobro: el importe es siempre el total (no hay pagos parciales); se elige medio y referencia.
 * Si hay precio en efectivo (`cashPesos`), el total cambia al elegir el medio.
 */
export function PaymentFields({ idPrefix, defaultPesos, cashPesos }: { idPrefix: string; defaultPesos: string; cashPesos?: string | null }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[160px_1fr_1fr]">
      <MethodTotal idPrefix={idPrefix} listPesos={defaultPesos} cashPesos={cashPesos} />
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
