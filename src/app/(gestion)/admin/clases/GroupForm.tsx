import { CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import type { Catalog, GroupRow } from "@/lib/grilla";
import { STATUS_LABELS } from "./messages";

/** Formulario de un grupo, para crearlo o editarlo. */
export function GroupForm({
  catalog,
  group,
  action,
}: {
  catalog: Catalog;
  group?: GroupRow;
  action: (formData: FormData) => Promise<void>;
}) {
  // Activos, más el que ya tiene asignado aunque esté inactivo (para no perderlo al guardar).
  const opts = <T extends { id: string; active: boolean }>(items: T[], current: string | null | undefined, label: (i: T) => string) =>
    items.filter((i) => i.active || i.id === current).map((i) => ({ value: i.id, label: i.active ? label(i) : `${label(i)} (inactivo)` }));

  return (
    <form action={action} className="flex max-w-xl flex-col gap-5">
      {group && <input type="hidden" name="id" value={group.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField name="style_id" label="Estilo" required placeholder="Elegí…" defaultValue={group?.styleId} options={opts(catalog.styles, group?.styleId, (i) => i.name)} />
        <SelectField name="age_category_id" label="Categoría de edad" required placeholder="Elegí…" defaultValue={group?.ageCategoryId} options={opts(catalog.ageCategories, group?.ageCategoryId, (i) => i.name)} />
        <SelectField name="level_id" label="Nivel" placeholder="Sin nivel" defaultValue={group?.levelId ?? ""} options={opts(catalog.levels, group?.levelId, (i) => i.name)} />
        <SelectField name="teacher_id" label="Profe" placeholder="A confirmar" defaultValue={group?.teacherId ?? ""} options={opts(catalog.teachers.map((t) => ({ ...t, name: t.displayName })), group?.teacherId, (i) => i.name)} />
        <TextField name="capacity" label="Cupo" inputMode="numeric" required defaultValue={String(group?.capacity ?? 20)} hint="Lugares por clase." />
        {group && (
          <SelectField
            name="status"
            label="Estado"
            required
            defaultValue={group.status}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        )}
      </div>
      <CheckboxField
        name="allows_single_booking"
        label="Acepta clases sueltas y packs"
        hint="Si no está marcado, el grupo es sólo para alumnos con cuota de profe."
        defaultChecked={group?.allowsSingleBooking ?? true}
      />
      <TextAreaField name="description" label="Descripción para los alumnos" defaultValue={group?.description} maxLength={1000} />
      <div className="sm:max-w-xs">
        <SubmitButton pendingText="Guardando…">{group ? "Guardar cambios" : "Crear grupo"}</SubmitButton>
      </div>
    </form>
  );
}
