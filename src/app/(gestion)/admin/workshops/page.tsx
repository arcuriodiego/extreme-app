import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/status/NoAccess";
import { ButtonLink, PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { longDate } from "@/domain/classes/sessions";
import { canOpen } from "@/domain/navigation/menus";
import { formatARS } from "@/domain/shared/money";
import { seatsLabel } from "@/domain/workshops/workshops";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadWorkshops, type WorkshopRow } from "@/lib/workshops";
import { STATUS } from "./messages";

export const metadata: Metadata = { title: "Workshops" };

function Item({ w }: { w: WorkshopRow }) {
  const first = w.sessions[0];
  return (
    <li className="border-t border-line">
      <Link href={`/admin/workshops/${w.id}`} className="flex items-center justify-between gap-3 py-3.5 text-ink no-underline hover:text-ink">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 font-semibold">
            {w.title}
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[w.status].style}`}>{STATUS[w.status].label}</span>
          </span>
          <span className="text-sm text-muted">
            {first ? `${longDate(first.date)} ${first.start}` : "Sin fechas"}
            {w.sessions.length > 1 ? ` (+${w.sessions.length - 1} ${w.sessions.length === 2 ? "fecha" : "fechas"})` : ""}
            {w.teacherName ? ` · ${w.teacherName}` : ""} · {formatARS(w.priceCents)} en efectivo · {formatARS(w.nonCashPriceCents)} otros medios
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold">
          {w.taken}/{w.capacity}
          <span className="block text-xs font-normal text-muted">{seatsLabel(w.capacity, w.taken + w.held)}</span>
        </span>
      </Link>
    </li>
  );
}

export default async function WorkshopsPage() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "workshops")) return <NoAccess />;
  const canManage = can(profile.access, "classes.manage");

  const workshops = await loadWorkshops(await createClient());
  const upcoming = workshops.filter((w) => !w.finished && w.status !== "cancelled");
  const past = workshops.filter((w) => w.finished || w.status === "cancelled");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Workshops" subtitle="Pago aparte. Abiertos también a gente de afuera: la inscribe recepción." />
        {canManage && <ButtonLink href="/admin/workshops/nuevo">Nuevo workshop</ButtonLink>}
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Próximos</h2>
        {upcoming.length === 0 ? (
          <p className="text-[15px] text-muted">No hay workshops próximos.</p>
        ) : (
          <ul className="flex flex-col">
            {upcoming.map((w) => (
              <Item key={w.id} w={w} />
            ))}
          </ul>
        )}
      </section>
      {past.length > 0 && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-semibold">Pasados y cancelados ({past.length})</summary>
          <ul className="flex flex-col pt-2">
            {past.map((w) => (
              <Item key={w.id} w={w} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
