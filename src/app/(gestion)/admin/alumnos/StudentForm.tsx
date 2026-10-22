import { SelectField, SubmitButton, TextField } from "@/components/forms/fields";
import { STUDENT_STATUS_LABELS } from "@/domain/people/student";
import type { StudentRow } from "@/lib/students";

const statusOptions = Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => ({ value, label }));

/** Datos de la ficha. Con cuenta, el nombre y el teléfono vienen de la app y no se editan acá. */
export function StudentForm({ student, action }: { student?: StudentRow; action: (formData: FormData) => Promise<void> }) {
  const locked = student?.hasAccount ?? false;
  return (
    <form action={action} className="flex max-w-xl flex-col gap-5">
      {student && <input type="hidden" name="id" value={student.id} />}
      {locked && <input type="hidden" name="has_account" value="1" />}
      {!locked && (
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="first_name" label="Nombre" required autoComplete="off" defaultValue={student?.firstName} />
          <TextField name="last_name" label="Apellido" autoComplete="off" defaultValue={student?.lastName} />
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="dni" label="DNI" inputMode="numeric" autoComplete="off" defaultValue={student?.dni ?? ""} hint="Sin puntos." />
        <TextField name="birth_date" label="Fecha de nacimiento" type="date" defaultValue={student?.birthDate ?? ""} />
        {!locked && <TextField name="phone" label="Teléfono" type="tel" inputMode="tel" defaultValue={student?.phone ?? ""} />}
        <SelectField name="status" label="Estado" required defaultValue={student?.status ?? "active"} options={statusOptions} />
      </div>
      <div className="sm:max-w-xs">
        <SubmitButton pendingText="Guardando…">{student ? "Guardar cambios" : "Crear ficha"}</SubmitButton>
      </div>
    </form>
  );
}
