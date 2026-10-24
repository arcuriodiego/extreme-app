import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/forms/fields";
import { RoleBadges } from "@/components/status/RoleBadges";
import { LinkCard } from "@/components/ui/basics";
import { hasGestion } from "@/domain/navigation/menus";
import { AccessLight } from "@/components/status/AccessLight";
import { getActiveStudent } from "@/lib/active-student";
import { lightFor, loadCharges, loadGraceDays } from "@/lib/billing";
import { ensureNotifications } from "@/lib/notifications";
import { academyToday } from "@/lib/grilla";
import { loadActiveMemberships } from "@/lib/memberships";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { TeacherAvatar } from "@/components/images/TeacherAvatar";

export const metadata: Metadata = { title: "Inicio" };

const notices: Record<string, string> = {
  "clave-actualizada": "Listo, tu contraseña nueva ya está activa.",
};

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  const notice = params.aviso ? notices[params.aviso] : undefined;
  const missingData = !profile.phone || !profile.birthDate;
  const showGestion = hasGestion(profile.access);
  const supabase = await createClient();
  const today = academyToday();
  const [{ active }, graceDays] = await Promise.all([getActiveStudent(), loadGraceDays(supabase), ensureNotifications(supabase)]);
  const studentId = active?.id ?? null;
  const viewingChild = active !== null && !active.isSelf;
  const memberships = studentId ? await loadActiveMemberships(supabase, studentId).catch(() => []) : [];
  const charges = studentId && memberships.length > 0 ? await loadCharges(supabase, studentId).catch(() => []) : [];

  return (
    <>
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">
          Hola{profile.firstName ? `, ${profile.firstName}` : ""}
        </h1>
        <RoleBadges roles={profile.access.roles} />
        {viewingChild && <p className="text-[15px] font-semibold">Estás viendo a {active.name}.</p>}
      </div>

      {showGestion && <LinkCard href="/admin" title="Gestión" description="Alumnos, clases, pagos y más" dark />}

      {memberships.map((m) => (
        <section key={m.id} aria-label={viewingChild ? `Cuota de ${active.firstName}` : "Tu cuota de profe"} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-5">
          <div className="flex items-center gap-3">
            <TeacherAvatar name={m.teacherName} url={m.teacherPhotoUrl} size={48} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display text-xl font-bold uppercase tracking-wide">{m.planName}</span>
              <span className="text-[15px] text-muted">
                Prof. {m.teacherName} · {m.ageCategoryName}
              </span>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {m.enrollments.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-[15px]">
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">FIJA</span>
                {e.label}
              </li>
            ))}
          </ul>
          {m.anchorDay === null ? (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn-ink">
              {viewingChild ? "El vencimiento se fija con el primer pago." : "Tu vencimiento se fija con tu primer pago."} Acercate a recepción para abonar.
            </p>
          ) : (
            <AccessLight
              state={lightFor(
                charges.filter((c) => c.membershipId === m.id),
                today,
                graceDays,
              )}
              planName={`Vence el ${m.anchorDay} de cada mes`}
            />
          )}
        </section>
      ))}

      {memberships.length === 0 && (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line p-5">
          <span className="font-display text-xl font-bold uppercase tracking-wide">
            {viewingChild ? `${active.firstName} no tiene cuota de profe` : "Tu cuenta está lista"}
          </span>
          <p className="text-[15px] leading-snug text-muted">
            Mirá la grilla en Clases. Para tener un lugar fijo con un profe, la inscripción se hace en recepción.
          </p>
        </section>
      )}

      {missingData && (
        <Link
          href="/perfil"
          className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line p-4 text-ink no-underline hover:border-ink"
        >
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Completá tus datos</span>
            <span className="text-sm text-muted">Teléfono y fecha de nacimiento, para avisos importantes.</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      )}
    </>
  );
}
