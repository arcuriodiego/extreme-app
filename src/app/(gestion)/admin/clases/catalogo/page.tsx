import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { type CatalogItem, loadCatalog } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { addCatalogItem, addRoom, renameTeacher, setCatalogItemActive } from "../actions";
import { ERRORS, NOTICES } from "../messages";
import { SectionTabs } from "../SectionTabs";

export const metadata: Metadata = { title: "Catálogo y salas" };

const input = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

function ToggleActive({ kind, item }: { kind: string; item: CatalogItem }) {
  return (
    <form action={setCatalogItemActive}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="active" value={item.active ? "false" : "true"} />
      <SmallSubmit>{item.active ? "Desactivar" : "Activar"}</SmallSubmit>
    </form>
  );
}

function ItemName({ item, extra }: { item: CatalogItem; extra?: string }) {
  return (
    <span className={item.active ? "" : "text-muted"}>
      {item.name}
      {extra && <span className="text-muted"> · {extra}</span>}
      {!item.active && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs font-bold">INACTIVO</span>}
    </span>
  );
}

function CatalogSection({ title, kind, items, addLabel }: { title: string; kind: string; items: CatalogItem[]; addLabel: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">{title}</h2>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5">
            <ItemName item={item} />
            <ToggleActive kind={kind} item={item} />
          </li>
        ))}
      </ul>
      <form action={addCatalogItem} className="flex gap-2">
        <input type="hidden" name="kind" value={kind} />
        <label className="sr-only" htmlFor={`nuevo-${kind}`}>
          {addLabel}
        </label>
        <input id={`nuevo-${kind}`} name="name" required maxLength={40} placeholder={addLabel} className={`${input} flex-1`} />
        <SmallSubmit tone="dark">Agregar</SmallSubmit>
      </form>
    </section>
  );
}

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!can(profile.access, "classes.manage")) return <NoAccess />;

  const catalog = await loadCatalog(await createClient());
  const notice = params.aviso ? NOTICES[params.aviso] : undefined;
  const failure = params.error ? ERRORS[params.error] : undefined;

  return (
    <>
      <PageHeader title="Clases y grilla" subtitle="Lo que se usa para armar los grupos. Desactivar algo no lo borra: deja de ofrecerse para grupos nuevos." />
      <SectionTabs current="catalogo" canManage />
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <div className="grid gap-10 xl:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Salas</h2>
          {catalog.rooms.length === 0 && <p className="text-[15px] text-muted">Todavía no hay salas. Cargalas para poder armar horarios.</p>}
          <ul className="flex flex-col">
            {catalog.rooms.map((room) => (
              <li key={room.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5">
                <ItemName item={room} extra={`${room.capacity} personas`} />
                <ToggleActive kind="sala" item={room} />
              </li>
            ))}
          </ul>
          <form action={addRoom} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="nueva-sala">
              Nombre de la sala
            </label>
            <input id="nueva-sala" name="name" required maxLength={40} placeholder="Nombre (ej. Sala 1)" className={`${input} flex-1`} />
            <label className="sr-only" htmlFor="capacidad-sala">
              Capacidad
            </label>
            <input id="capacidad-sala" name="capacity" required inputMode="numeric" placeholder="Capacidad" className={`${input} w-28`} />
            <SmallSubmit tone="dark">Agregar</SmallSubmit>
          </form>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Profes</h2>
          <p className="text-[15px] text-muted">
            Se suman asignando el rol Profesor en <Link href="/admin/usuarios">Usuarios y roles</Link>. Acá podés cambiar el nombre que ven los alumnos.
          </p>
          {catalog.teachers.length === 0 && <p className="text-[15px] text-muted">Todavía no hay profes.</p>}
          <ul className="flex flex-col">
            {catalog.teachers.map((t) => (
              <li key={t.id} className="border-t border-line py-2.5">
                <form action={renameTeacher} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <label className="sr-only" htmlFor={`profe-${t.id}`}>
                    Nombre visible de {t.displayName}
                  </label>
                  <input id={`profe-${t.id}`} name="display_name" defaultValue={t.displayName} maxLength={60} required className={`${input} flex-1`} />
                  {!t.active && <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold">SIN ROL</span>}
                  <SmallSubmit>Guardar</SmallSubmit>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <CatalogSection title="Estilos" kind="estilo" items={catalog.styles} addLabel="Nuevo estilo" />
        <CatalogSection title="Categorías de edad" kind="categoria" items={catalog.ageCategories} addLabel="Nueva categoría" />
        <CatalogSection title="Niveles" kind="nivel" items={catalog.levels} addLabel="Nuevo nivel" />
      </div>
    </>
  );
}
