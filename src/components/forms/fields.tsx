"use client";

import { useFormStatus } from "react-dom";

/** Campo de texto con etiqueta y mensaje de error accesibles. */
export function TextField({
  name,
  label,
  type = "text",
  autoComplete,
  defaultValue,
  error,
  hint,
  required,
  inputMode,
}: {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "tel" | "date" | "time";
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric";
}) {
  const id = `campo-${name}`;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-ayuda` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[#3d3d3d]">
        {label}
        {!required && <span className="font-normal text-muted"> (opcional)</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-12 w-full rounded-xl border bg-white px-4 text-base text-ink outline-none transition-colors focus:border-ink ${
          error ? "border-alert" : "border-[#cfcfcf]"
        }`}
      />
      {hint && !error && (
        <p id={`${id}-ayuda`} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-semibold text-alert-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/** Botón principal que se desactiva mientras se envía el formulario. */
export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-base font-bold text-white transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function FormAlert({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  const styles =
    kind === "error"
      ? "border-alert bg-alert-soft text-alert-ink"
      : "border-ok bg-ok-soft text-ok-ink";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl border-[1.5px] px-4 py-3 text-[15px] font-semibold ${styles}`}>
      {children}
    </div>
  );
}

const controlBase =
  "w-full rounded-xl border border-[#cfcfcf] bg-white px-4 text-base text-ink outline-none transition-colors focus:border-ink";

/** Lista desplegable con etiqueta. */
export function SelectField({
  name,
  label,
  options,
  defaultValue,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const id = `campo-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[#3d3d3d]">
        {label}
        {!required && <span className="font-normal text-muted"> (opcional)</span>}
      </label>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} required={required} className={`h-12 ${controlBase}`}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Texto largo. */
export function TextAreaField({ name, label, defaultValue, maxLength }: { name: string; label: string; defaultValue?: string; maxLength?: number }) {
  const id = `campo-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[#3d3d3d]">
        {label} <span className="font-normal text-muted">(opcional)</span>
      </label>
      <textarea id={id} name={name} defaultValue={defaultValue} maxLength={maxLength} rows={3} className={`py-3 ${controlBase}`} />
    </div>
  );
}

/** Casilla de sí/no con explicación. */
export function CheckboxField({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked?: boolean }) {
  const id = `campo-${name}`;
  return (
    <div className="flex items-start gap-3">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-1 size-5 accent-ink" />
      <label htmlFor={id} className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{label}</span>
        {hint && <span className="text-[13px] text-muted">{hint}</span>}
      </label>
    </div>
  );
}

/** Botón chico para acciones dentro de listas (activar, quitar, guardar). */
export function SmallSubmit({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "danger" | "dark" }) {
  const { pending } = useFormStatus();
  const styles = {
    default: "border border-[#cfcfcf] bg-white text-ink hover:border-ink",
    danger: "border border-alert bg-white text-alert-ink hover:bg-alert-soft",
    dark: "border border-ink bg-ink text-white hover:bg-[#333]",
  }[tone];
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors disabled:opacity-60 ${styles}`}>
      {children}
    </button>
  );
}
