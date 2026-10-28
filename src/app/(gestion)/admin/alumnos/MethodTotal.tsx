"use client";

import { useState } from "react";
import { COUNTER_METHODS, PAYMENT_METHOD_LABELS } from "@/domain/billing/payments";

const input = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

/**
 * Total a cobrar según el medio: en efectivo, el precio en efectivo (si hay);
 * con otros medios, el precio completo. El importe viaja oculto para que la base
 * confirme que es el mismo que vio recepción.
 */
export function MethodTotal({ idPrefix, listPesos, cashPesos }: { idPrefix: string; listPesos: string; cashPesos?: string | null }) {
  const [method, setMethod] = useState("cash");
  const isCash = method === "cash" && !!cashPesos;
  const shown = isCash ? cashPesos! : listPesos;
  return (
    <>
      <input type="hidden" name="amount" value={shown} />
      <div className="flex flex-col gap-1 text-sm font-semibold">
        Total a cobrar
        <span className="flex h-10 items-center text-lg font-bold">${shown}</span>
        {cashPesos && (
          <span className="-mt-1 text-xs font-normal text-muted">{isCash ? `Precio en efectivo (otros medios $${listPesos})` : `En efectivo: $${cashPesos}`}</span>
        )}
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor={`${idPrefix}-medio`}>
        Medio
        <select id={`${idPrefix}-medio`} name="method" required value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
          {COUNTER_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
