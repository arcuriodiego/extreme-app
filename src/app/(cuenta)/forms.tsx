"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/fields";
import { PASSWORD_MIN } from "@/domain/auth/validation";
import {
  type FormState,
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
  updateProfile,
} from "./actions";

const initial: FormState = {};
const passwordHint = `Al menos ${PASSWORD_MIN} caracteres, con una letra y un número.`;

export function SignInForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(signIn, initial);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {notice && !state.error && <FormAlert kind="error">{notice}</FormAlert>}
      {state.error && <FormAlert kind="error">{state.error}</FormAlert>}
      {next && <input type="hidden" name="next" value={next} />}
      <TextField name="email" label="Email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={e.email} />
      <TextField name="password" label="Contraseña" type="password" autoComplete="current-password" required error={e.password} />
      <Link href="/recuperar" className="-mt-2 self-start text-sm font-semibold">
        Olvidé mi contraseña
      </Link>
      <SubmitButton pendingText="Ingresando…">Ingresar</SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, initial);
  const e = state.fieldErrors ?? {};
  if (state.message) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert kind="ok">{state.message}</FormAlert>
        <Link href="/ingresar" className="font-semibold">
          Ir a ingresar
        </Link>
      </div>
    );
  }
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.error && <FormAlert kind="error">{state.error}</FormAlert>}
      <AccountTypeField defaultValue={state.values?.accountType} />
      <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2">
        <TextField name="firstName" label="Nombre" autoComplete="given-name" required defaultValue={state.values?.firstName} error={e.firstName} />
        <TextField name="lastName" label="Apellido" autoComplete="family-name" required defaultValue={state.values?.lastName} error={e.lastName} />
      </div>
      <TextField name="email" label="Email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={e.email} />
      <TextField name="password" label="Contraseña" type="password" autoComplete="new-password" required hint={passwordHint} error={e.password} />
      <TextField name="passwordConfirm" label="Repetí la contraseña" type="password" autoComplete="new-password" required error={e.passwordConfirm} />
      <SubmitButton pendingText="Creando cuenta…">Crear cuenta</SubmitButton>
      <p className="text-[13px] leading-snug text-muted">
        Si sos madre, padre o tutor/a, creá la cuenta con tus datos: desde ahí anotás a tus hijos y manejás sus clases, pases y pagos.
      </p>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  if (state.message) return <FormAlert kind="ok">{state.message}</FormAlert>;
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.error && <FormAlert kind="error">{state.error}</FormAlert>}
      <TextField name="email" label="Email de tu cuenta" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <SubmitButton pendingText="Enviando…">Enviarme el enlace</SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.error && <FormAlert kind="error">{state.error}</FormAlert>}
      <TextField name="password" label="Contraseña nueva" type="password" autoComplete="new-password" required hint={passwordHint} error={e.password} />
      <TextField name="passwordConfirm" label="Repetí la contraseña nueva" type="password" autoComplete="new-password" required error={e.passwordConfirm} />
      <SubmitButton pendingText="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}

export function ProfileForm({ initialValues }: { initialValues: Record<string, string> }) {
  const [state, action] = useActionState(updateProfile, { values: initialValues });
  const e = state.fieldErrors ?? {};
  const v = state.values ?? initialValues;
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.error && <FormAlert kind="error">{state.error}</FormAlert>}
      {state.message && <FormAlert kind="ok">{state.message}</FormAlert>}
      <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2">
        <TextField name="firstName" label="Nombre" autoComplete="given-name" required defaultValue={v.firstName} error={e.firstName} />
        <TextField name="lastName" label="Apellido" autoComplete="family-name" required defaultValue={v.lastName} error={e.lastName} />
      </div>
      <TextField name="phone" label="Teléfono" type="tel" autoComplete="tel" inputMode="tel" defaultValue={v.phone} error={e.phone} hint="Para avisos importantes sobre tus clases." />
      <TextField name="birthDate" label="Fecha de nacimiento" type="date" autoComplete="bday" defaultValue={v.birthDate} error={e.birthDate} />
      <SubmitButton pendingText="Guardando…">Guardar cambios</SubmitButton>
    </form>
  );
}

/** ¿Quién usa la cuenta? Los padres no toman clases: su cuenta es sólo para manejar a sus hijos. */
function AccountTypeField({ defaultValue }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue === "guardian" ? "guardian" : "student");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1 text-sm font-semibold text-[#3d3d3d]">¿Quién va a tomar clases?</legend>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {(
          [
            ["student", "Yo", "Voy a tomar clases"],
            ["guardian", "Mi hijo/a", "Soy madre, padre o tutor/a"],
          ] as const
        ).map(([v, title, sub]) => (
          <label
            key={v}
            className={`flex cursor-pointer flex-col rounded-xl border px-4 py-3 ${value === v ? "border-ink bg-ink text-white" : "border-[#cfcfcf] bg-white"}`}
          >
            <input type="radio" name="accountType" value={v} checked={value === v} onChange={() => setValue(v)} className="sr-only" />
            <span className="font-semibold">{title}</span>
            <span className={`text-[13px] ${value === v ? "text-white/80" : "text-muted"}`}>{sub}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
