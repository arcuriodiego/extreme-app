import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/basics";
import { formatARS } from "@/domain/shared/money";
import { academyToday } from "@/lib/grilla";
import { methodLabel } from "@/domain/billing/payments";
import { getActiveStudent } from "@/lib/active-student";
import { ensureCharges, loadCharges, loadPayments, loadSurcharge } from "@/lib/billing";
import { otherPrice } from "@/domain/billing/cash-price";
import { loadPlans } from "@/lib/prices";
import { loadTransferInfo } from "@/lib/receipts";
import { hasTransferInfo, transferLines } from "@/domain/billing/whatsapp";
import { requireProfile } from "@/lib/session";
import { FormAlert } from "@/components/forms/fields";
import { PURCHASE_ERRORS, PURCHASE_NOTICES } from "@/domain/payments/messages";
import { mpConfigured } from "@/lib/mercadopago";
import { loadStudentRegistrations, loadWorkshops } from "@/lib/workshops";
import { BuySection } from "./BuySection";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pagos y compras" };

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function PagosPage({ searchParams }: { searchParams: Promise<{ error?: string; aviso?: string }> }) {
  const today = academyToday();
  const [, query] = await Promise.all([requireProfile(), searchParams]);
  const supabase = await createClient();
  const [allPlans, { active }, surcharge] = await Promise.all([
    loadPlans(supabase, today).catch(() => []),
    getActiveStudent(),
    loadSurcharge(supabase).catch(() => 0),
    ensureCharges(supabase),
  ]);
  const studentId = active?.id ?? null;
  const child = active !== null && !active.isSelf;
  const plans = allPlans.filter((p) => p.active && p.current);
  const charges = studentId ? await loadCharges(supabase, studentId).catch(() => []) : [];
  const payments = studentId ? await loadPayments(supabase, studentId).catch(() => []) : [];
  const receiptIds = payments.map((p) => p.receiptId).filter((x): x is string => Boolean(x));
  const [transfer, receiptRows] = await Promise.all([
    loadTransferInfo(supabase).catch(() => null),
    receiptIds.length > 0 ? supabase.from("receipts").select("id, token, number").in("id", receiptIds).then((r) => r.data ?? []) : Promise.resolve([]),
  ]);
  const receipts = new Map((receiptRows as { id: string; token: string; number: number }[]).map((r) => [r.id, r]));
  const transferInfo = transferLines(transfer);
  const owed = charges.filter((c) => c.pendingCents > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const [allWorkshops, myRegs] = await Promise.all([
    loadWorkshops(supabase).catch(() => []),
    studentId ? loadStudentRegistrations(supabase, studentId).catch(() => []) : Promise.resolve([]),
  ]);
  const enrolled = new Set(myRegs.map((r) => r.workshopId));
  const { data: transferRows } = studentId
    ? await supabase
        .from("purchases")
        .select("id, description, status, reject_reason, created_at")
        .eq("student_id", studentId)
        .eq("channel", "transfer")
        .in("status", ["pending", "rejected"])
        .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order("created_at", { ascending: false })
    : { data: [] };
  const myTransfers = (transferRows ?? []) as { id: string; description: string; status: string; reject_reason: string | null }[];
  const buyableWorkshops = allWorkshops.filter(
    (w) => w.status === "published" && !w.finished && w.sessions.length > 0 && !enrolled.has(w.id) && w.taken + w.held < w.capacity && (w.firstStart ?? "") > new Date().toISOString(),
  );
  const fmt = (d: string) => d.split("-").reverse().join("/");

  return (
    <>
      <PageHeader title={child ? `Pagos y compras de ${active.firstName}` : "Pagos y compras"} />
      {query.error && PURCHASE_ERRORS[query.error] && <FormAlert kind="error">{PURCHASE_ERRORS[query.error]}</FormAlert>}
      {query.aviso && PURCHASE_NOTICES[query.aviso] && <FormAlert kind="ok">{PURCHASE_NOTICES[query.aviso]}</FormAlert>}
      {myTransfers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide">Tus transferencias</h2>
          <ul className="flex flex-col gap-2">
            {myTransfers.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3.5">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">{t.description}</span>
                  <span className="text-sm text-muted">
                    {t.status === "pending"
                      ? "En revisión: recepción la confirma apenas vea la transferencia."
                      : `Rechazada${t.reject_reason ? `: ${t.reject_reason}` : ""}. Consultá en recepción.`}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${t.status === "pending" ? "bg-warn-soft text-warn-ink" : "bg-alert-soft text-alert-ink"}`}
                >
                  {t.status === "pending" ? "EN REVISIÓN" : "RECHAZADA"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">{child ? "Lo que debe" : "Lo que debés"}</h2>
        {owed.length === 0 ? (
          <p className="rounded-xl bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-ink">
            <span aria-hidden="true">✓ </span>{child ? "No tiene nada pendiente." : "No tenés nada pendiente."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {owed.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{c.description}</span>
                  <span className="text-sm text-muted">
                    {c.dueDate < today ? `Venció el ${fmt(c.dueDate)}` : `Vence el ${fmt(c.dueDate)}`}
                    {c.paidCents > 0 ? ` · Ya pagaste ${formatARS(c.paidCents)}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <strong className="font-display text-2xl">{formatARS(c.pendingCents)}</strong>
                  {c.cashCents !== null && <span className="text-sm text-muted">{formatARS(c.cashCents)} en efectivo</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted">
          Podés pagar en recepción (efectivo, transferencia, QR o tarjeta) o desde la app con Mercado Pago. Pagando en efectivo en recepción
          tenés descuento.
        </p>
        {transferInfo.length > 0 && (
          <div className="flex flex-col gap-1 rounded-xl border border-line p-4">
            <span className="font-semibold">Para pagar por transferencia</span>
            {transferInfo.map((line) => (
              <span key={line} className="select-all text-[15px]">
                {line}
              </span>
            ))}
            <span className="pt-1 text-sm text-muted">Después mandá el comprobante por WhatsApp o mostralo en recepción.</span>
          </div>
        )}
      </section>

      {studentId && (
        <BuySection
          ready={mpConfigured()}
          transfer={hasTransferInfo(transfer)}
          canBuy={active?.canBook ?? false}
          who={child ? active.firstName : null}
          owedMemberships={owed.filter((c) => c.membershipId !== null)}
          packs={plans.filter((p) => p.kind === "pack" && p.current)}
          single={plans.find((p) => p.kind === "single_class" && p.current) ?? null}
          workshops={buyableWorkshops}
          surcharge={surcharge}
        />
      )}

      {payments.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Tus pagos</h2>
          <ul className="flex flex-col">
            {payments
              .filter((p) => p.status === "approved")
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[15px]">
                  <span className="flex flex-col">
                    <span>{p.concepts[0] ?? "Pago"}</span>
                    <span className="text-sm text-muted">
                      {fmt(p.date)} · {methodLabel(p.method)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <strong>{formatARS(p.amountCents)}</strong>
                    {p.receiptId && receipts.get(p.receiptId) && (
                      <Link href={`/recibo/${receipts.get(p.receiptId)!.token}`} className="text-sm font-semibold underline">
                        Recibo N° {receipts.get(p.receiptId)!.number}
                      </Link>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {plans.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Precios</h2>
          <ul className="flex flex-col gap-2">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-sm text-muted">{p.description}</span>
                  {p.next && (
                    <span className="text-sm font-semibold text-warn-ink">
                      Desde el {dateFormat.format(new Date(`${p.next.validFrom}T12:00:00Z`))}: {formatARS(otherPrice(p.next.amountCents, surcharge, p.next.otherCents))}
                      {otherPrice(p.next.amountCents, surcharge, p.next.otherCents) > p.next.amountCents ? ` (${formatARS(p.next.amountCents)} en efectivo)` : ""}
                    </span>
                  )}
                </span>
                {p.current && (
                  <span className="flex shrink-0 flex-col items-end">
                    <strong className="font-display text-2xl">{formatARS(otherPrice(p.current.amountCents, surcharge, p.current.otherCents))}</strong>
                    {otherPrice(p.current.amountCents, surcharge, p.current.otherCents) > p.current.amountCents && (
                      <span className="text-sm text-muted">{formatARS(p.current.amountCents)} en efectivo</span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
