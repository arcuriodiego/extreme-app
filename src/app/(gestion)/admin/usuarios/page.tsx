import type { Metadata } from "next";
import { FormAlert } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { RoleBadges } from "@/components/status/RoleBadges";
import { ASSIGNABLE_ROLES, ROLE_LABELS, can, isRoleCode, sortRoles } from "@/domain/auth/roles";
import { canOpen } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { setRole } from "./actions";

export const metadata: Metadata = { title: "Usuarios y roles" };

const notices: Record<string, string> = {
  "rol-asignado": "Listo, asignamos el rol.",
  "rol-quitado": "Listo, quitamos el rol.",
};

const errors: Record<string, string> = {
  "sin-permiso": "No tenés permiso para cambiar roles.",
  "ultimo-admin": "Tiene que quedar al menos una persona con rol de Administración.",
  datos: "No pudimos identificar a la persona o el rol. Recargá la página y probá de nuevo.",
  generico: "No pudimos guardar el cambio. Probá de nuevo.",
};

interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  user_roles: { roles: { code: string } | null }[] | null;
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; aviso?: string; error?: string }>;
}) {
  const [me, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(me.access, "usuarios")) return <NoAccess />;

  const canManageRoles = can(me.access, "roles.manage");
  const q = (params.q ?? "").trim().slice(0, 80);
  const safeQ = q.replace(/[,()%*\\]/g, " ").trim();

  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("id, first_name, last_name, email, user_roles!user_roles_profile_id_fkey(roles(code))")
    .order("last_name")
    .order("first_name")
    .limit(100);
  if (safeQ) {
    query = query.or(`first_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%,email.ilike.%${safeQ}%`);
  }
  const { data, error } = await query;
  const people = ((data ?? []) as unknown as PersonRow[]).map((p) => ({
    id: p.id,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "(sin nombre)",
    email: p.email ?? "",
    roles: sortRoles((p.user_roles ?? []).map((ur) => ur.roles?.code ?? "").filter(isRoleCode)),
  }));

  const notice = params.aviso ? notices[params.aviso] : undefined;
  const failure = params.error ? errors[params.error] : undefined;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Usuarios y roles</h1>
        <p className="text-[15px] text-muted">
          Todas las cuentas de la academia. {canManageRoles ? "Tocá un rol para asignarlo o quitarlo." : ""}
        </p>
      </div>

      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}
      {error && <FormAlert kind="error">No pudimos cargar la lista. Recargá la página.</FormAlert>}

      <form role="search" className="flex flex-wrap gap-2">
        <label htmlFor="buscar" className="sr-only">
          Buscar por nombre o email
        </label>
        <input
          id="buscar"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Buscar por nombre o email"
          className="h-12 min-w-0 flex-1 rounded-xl border border-[#cfcfcf] bg-white px-4 text-base outline-none focus:border-ink"
        />
        <button type="submit" className="h-12 rounded-xl bg-ink px-5 font-bold text-white">
          Buscar
        </button>
      </form>

      <p className="text-sm text-muted">
        {people.length === 100 ? "Mostrando las primeras 100 personas. Usá el buscador para encontrar a alguien." : `${people.length} ${people.length === 1 ? "persona" : "personas"}`}
      </p>

      <ul className="flex flex-col">
        {people.map((person) => (
          <li key={person.id} className="flex flex-col gap-3 border-t border-line py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-semibold">
                {person.name}
                {person.id === me.id && <span className="font-normal text-muted"> (vos)</span>}
              </span>
              <span className="truncate text-sm text-muted">{person.email}</span>
              <RoleBadges roles={person.roles} />
            </div>

            {canManageRoles && (
              <div className="flex flex-wrap gap-2" aria-label={`Roles de ${person.name}`}>
                {ASSIGNABLE_ROLES.map((role) => {
                  const has = person.roles.includes(role);
                  return (
                    <form key={role} action={setRole}>
                      <input type="hidden" name="profileId" value={person.id} />
                      <input type="hidden" name="role" value={role} />
                      <input type="hidden" name="op" value={has ? "revoke" : "grant"} />
                      <input type="hidden" name="q" value={q} />
                      <button
                        type="submit"
                        aria-pressed={has}
                        aria-label={`${has ? "Quitar" : "Asignar"} ${ROLE_LABELS[role]} a ${person.name}`}
                        className={`h-9 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                          has
                            ? "border border-ink bg-ink text-white hover:bg-[#333]"
                            : "border border-[#cfcfcf] bg-white text-ink hover:border-ink"
                        }`}
                      >
                        {has ? "✓ " : "+ "}
                        {ROLE_LABELS[role]}
                      </button>
                    </form>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
