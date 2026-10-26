"use client";

import { useActionState, useState } from "react";
import { FormAlert, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { RELATIONSHIPS, type SignupFormState } from "@/domain/signup/signup";
import type { SignupSlot } from "@/lib/signups";
import { submitSignup } from "./actions";

const initial: SignupFormState = {};

export function SignupForm({
  slots,
  defaultFor,
  phone,
  birthDate,
  selfDone,
}: {
  slots: readonly SignupSlot[];
  defaultFor: "self" | "child";
  phone: string;
  birthDate: string;
  /** Ya tiene clase o inscripción propia: se ofrece primero anotar a un hijo. */
  selfDone: boolean;
}) {
  const [state, action] = useActionState(submitSignup, initial);
  const v = state.values ?? {};
  const [who, setWho] = useState<"self" | "child">((v.for as "self" | "child") || defaultFor);
  const chosen = new Set(state.scheduleIds ?? []);
  const days = [...new Set(slots.map((s) => s.dayLabel))];

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error && <FormAlert kind="error">{state.error}</FormAlert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 font-semibold">¿Para quién es la inscripción?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["self", "Para mí"],
              ["child", "Para mi hijo/a"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex h-12 cursor-pointer items-center justify-center rounded-xl border text-[15px] font-semibold ${
                who === value ? "border-ink bg-ink text-white" : "border-[#cfcfcf] bg-white"
              }`}
            >
              <input type="radio" name="for" value={value} checked={who === value} onChange={() => setWho(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {who === "self" && selfDone && <p className="text-sm text-muted">Ya tenés una inscripción o clase. Si la mandás de nuevo, se actualiza.</p>}
      </fieldset>

      <fieldset key={who} className="flex flex-col gap-4">
        <legend className="pb-2 font-semibold">{who === "child" ? "Datos de tu hijo/a" : "Tus datos"}</legend>
        {who === "child" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="first_name" label="Nombre" autoComplete="off" required defaultValue={v.first_name} />
              <TextField name="last_name" label="Apellido" autoComplete="off" required defaultValue={v.last_name} />
            </div>
            <SelectField
              name="relationship"
              label="Vos sos su…"
              required
              placeholder="Elegí…"
              defaultValue={v.relationship}
              options={Object.entries(RELATIONSHIPS).map(([value, label]) => ({ value, label }))}
            />
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="dni" label="DNI" inputMode="numeric" autoComplete="off" required hint="Solo números, sin puntos." defaultValue={v.dni} />
          <TextField
            name="birth_date"
            label="Fecha de nacimiento"
            type="date"
            required
            defaultValue={v.birth_date ?? (who === "self" ? birthDate : undefined)}
          />
        </div>
        <TextField
          name="phone"
          label={who === "child" ? "Teléfono de contacto" : "Teléfono"}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          hint={who === "child" ? "El tuyo o el de quien lo trae." : undefined}
          defaultValue={v.phone ?? phone}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="pb-1 font-semibold">¿A qué clases querés ir?</legend>
        <p className="text-sm text-muted">Elegí uno o más horarios (hasta 6). Recepción lo confirma cuando pases a pagar la cuota.</p>
        {slots.length === 0 && <p className="text-[15px] text-muted">Todavía no hay horarios cargados. Consultá en recepción.</p>}
        {days.map((day) => (
          <div key={day} className="flex flex-col">
            <span className="pb-1 text-sm font-bold uppercase tracking-wide text-muted">{day}</span>
            {slots
              .filter((s) => s.dayLabel === day)
              .map((s) => (
                <label key={s.id} className="flex cursor-pointer items-start gap-3 border-t border-line py-3">
                  <input type="checkbox" name="schedule_id" value={s.id} defaultChecked={chosen.has(s.id)} className="mt-0.5 size-5 shrink-0 accent-ink" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold leading-snug">
                      {s.start} a {s.end} · {s.title}
                    </span>
                    <span className="text-sm text-muted">
                      {s.teacherName ? `Prof. ${s.teacherName}` : "Profe a confirmar"} · {s.roomName}
                    </span>
                  </span>
                </label>
              ))}
          </div>
        ))}
      </fieldset>

      <TextAreaField name="note" label="¿Algo que tengamos que saber?" maxLength={500} defaultValue={v.note} />

      <SubmitButton pendingText="Enviando…">Enviar inscripción</SubmitButton>
      <p className="-mt-3 text-sm text-muted">
        Después pasá por recepción para pagar la cuota: ahí se confirma tu lugar en la clase.
      </p>
    </form>
  );
}
