import { SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import type { WorkshopRow } from "@/lib/workshops";
import { pesosText } from "../alumnos/PaymentFields";

export function WorkshopForm({ workshop, action }: { workshop?: WorkshopRow; action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="flex max-w-xl flex-col gap-5">
      {workshop && <input type="hidden" name="id" value={workshop.id} />}
      <TextField name="title" label="Nombre" required defaultValue={workshop?.title} hint="Ej.: Heels intensivo con invitada" />
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField name="price" label="Precio en efectivo" inputMode="numeric" required defaultValue={workshop ? pesosText(workshop.priceCents) : ""} hint="En pesos. Con otros medios se suma el recargo de Configuración." />
        <TextField name="capacity" label="Cupo" inputMode="numeric" required defaultValue={String(workshop?.capacity ?? 20)} />
        <TextField name="teacher_name" label="Profe" defaultValue={workshop?.teacherName ?? ""} />
      </div>
      <TextAreaField name="description" label="Descripción para los alumnos" defaultValue={workshop?.description} maxLength={2000} />
      <div className="sm:max-w-xs">
        <SubmitButton pendingText="Guardando…">{workshop ? "Guardar cambios" : "Crear workshop"}</SubmitButton>
      </div>
    </form>
  );
}
