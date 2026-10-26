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
import { academyToday, loadGroups } from "@/lib/grilla";
import { loadPendingSignup, signupSlots, slotLabel } from "@/lib/signups";
import { regulationPending } from "@/lib/regulations";
import { loadActiveMemberships } from "@/lib/memberships";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { TeacherAvatar } from "@/components/images/TeacherAvatar";

export const metadata: Metadata = { title: "Inicio" };

const notices: Record<string, string> = {
  "clave-actualizada": "Listo, tu contraseña nueva ya está activa.",
  "reglamento-aceptado": "Listo, aceptaste el reglamento.",
  "inscripcion-enviada": "Listo, recibimos la inscripción. Pasá por recepción para pagar la cuota y confirmar el lugar.",
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
  // Los padres no toman clases: su cuenta es sólo para manejar a sus hijos.
  const guardianOnly = profile.access.roles.includes("guardian") && !profile.access.roles.includes("student");
  const memberships = studentId ? await loadActiveMemberships(supabase, studentId).catch(() => []) : [];
  const pending = studentId && memberships.length === 0 ? await loadPendingSignup(supabase, studentId).catch(() => null) : null;
  const pendingSlots = pending ? signupSlots(await loadGroups(supabase, { onlyActive: true }).catch(() => [])) : [];
  const mustAccept = (profile.access.roles.includes("student") || profile.access.roles.includes("guardian")) && (await regulationPending(supabase).catch(() => false));
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

      {mustAccept && (
        <Link
          href="/reglamento"
          className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-warn-soft p-4 text-warn-ink no-underline"
        >
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Leé y aceptá el reglamento</span>
            <span className="text-sm">Hay una versión nueva del reglamento de la academia.</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      )}

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

      {memberships.length === 0 && pending && (
        <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border-[1.5px] border-ink p-5">
          <div className="flex flex-col gap-1">
            <span className="self-start rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn-ink">PENDIENTE</span>
            <span className="font-display text-xl font-bold uppercase tracking-wide">Inscripción enviada</span>
            <p className="text-[15px] leading-snug text-muted">
              Pasá por recepción para pagar la cuota: ahí {viewingChild ? `confirmamos el lugar de ${active.firstName}` : "confirmamos tu lugar"}.
            </p>
          </div>
          <ul className="flex flex-col gap-1.5 text-[15px]">
            {pending.scheduleIds.map((id) => (
              <li key={id}>{slotLabel(pendingSlots.find((s) => s.id === id))}</li>
            ))}
          </ul>
          <Link href={viewingChild ? "/inscripcion?para=hijo" : "/inscripcion"} className="self-start text-sm font-semibold">
            Cambiar los horarios
          </Link>
        </section>
      )}

      {memberships.length === 0 && !pending && guardianOnly && !viewingChild && (
        <Link
          href="/inscripcion?para=hijo"
          className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border-[1.5px] border-ink p-5 text-ink no-underline hover:bg-surface"
        >
          <span className="flex flex-col gap-1">
            <span className="font-display text-xl font-bold uppercase tracking-wide">Anotá a tu hijo/a</span>
            <span className="text-[15px] leading-snug text-muted">Cargá sus datos y elegí sus clases. Desde tu cuenta vas a ver sus cuotas, clases, pases y pagos.</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      )}

      {memberships.length === 0 && !pending && !(guardianOnly && !viewingChild) && (
        <Link
          href={viewingChild ? "/inscripcion?para=hijo" : "/inscripcion"}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border-[1.5px] border-ink p-5 text-ink no-underline hover:bg-surface"
        >
          <span className="flex flex-col gap-1">
            <span className="font-display text-xl font-bold uppercase tracking-wide">
              {viewingChild ? `Inscribí a ${active.firstName} a sus clases` : "Inscribite a tus clases"}
            </span>
            <span className="text-[15px] leading-snug text-muted">Completá los datos y elegí los horarios. La cuota se paga en recepción.</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      )}

      {(active?.isSelf || (guardianOnly && active)) && (
        <Link href="/inscripcion?para=hijo" className="self-start text-[15px] font-semibold">
          {guardianOnly ? "Anotar a otro hijo/a" : "Anotar a un hijo/a"}
        </Link>
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
