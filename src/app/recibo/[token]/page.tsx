import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { academyConfig } from "@/config/academy";
import { methodLabel } from "@/domain/billing/payments";
import { formatARS } from "@/domain/shared/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recibo", robots: { index: false, follow: false } };

interface ReceiptView {
  academy: string;
  timezone: string;
  number: number;
  issued_at: string;
  void: boolean;
  total_cents: number;
  methods: string[];
  reference: string | null;
  items: { student: string; description: string; amount_cents: number }[];
}

/** Recibo que recibe la familia por WhatsApp. Se abre sin iniciar sesión, sólo con el código del link. */
export default async function ReciboPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{20,64}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("receipt_view", { p_token: token });
  const r = data as ReceiptView | null;
  if (!r) notFound();

  const date = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: r.timezone }).format(new Date(r.issued_at));
  const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: r.timezone }).format(new Date(r.issued_at));

  return (
    <div className="theme-light min-h-dvh bg-surface px-4 py-8">
      <style>{`html, body { background: #f6f6f6; } @media print { .no-print { display: none; } }`}</style>
      <article className="mx-auto flex max-w-md flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-sm">
        <header className="flex flex-col items-center gap-3 text-center">
          <Image src={academyConfig.logo.light} alt={r.academy} width={academyConfig.logo.width} height={academyConfig.logo.height} priority className="h-auto w-44" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold uppercase tracking-wider text-muted">Recibo de pago</span>
            <span className="font-display text-3xl font-bold uppercase leading-none tracking-wide">N° {String(r.number).padStart(5, "0")}</span>
            <span className="text-sm text-muted">
              {date} · {time} hs
            </span>
          </div>
        </header>

        {r.void && (
          <p className="rounded-xl border border-alert bg-alert-soft px-4 py-2 text-center text-sm font-bold text-alert-ink">
            ESTE RECIBO TIENE UN PAGO ANULADO
          </p>
        )}

        <ul className="flex flex-col">
          {r.items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-3 border-b border-line py-2.5 text-[15px] last:border-b-0">
              <span className="flex flex-col">
                <span className="font-semibold">{it.student}</span>
                <span className="text-sm text-muted">{it.description}</span>
              </span>
              <strong className="shrink-0">{formatARS(Number(it.amount_cents))}</strong>
            </li>
          ))}
        </ul>

        <div className="flex items-end justify-between border-t-2 border-ink pt-3">
          <span className="flex flex-col text-sm text-muted">
            <span>Pagado con {r.methods.map(methodLabel).join(" y ").toLowerCase()}</span>
            {r.reference && <span>Operación {r.reference}</span>}
          </span>
          <span className="flex flex-col items-end">
            <span className="text-[13px] font-bold uppercase tracking-wider text-muted">Total</span>
            <strong className="font-display text-4xl leading-none">{formatARS(Number(r.total_cents))}</strong>
          </span>
        </div>

        <footer className="flex flex-col items-center gap-1 border-t border-line pt-4 text-center text-xs text-muted">
          <span>{r.academy} · {academyConfig.address}</span>
          <span>Comprobante interno, no válido como factura.</span>
        </footer>
      </article>
      <p className="no-print mx-auto mt-4 max-w-md text-center text-sm text-muted">Podés guardarlo o imprimirlo desde el menú del navegador.</p>
    </div>
  );
}
