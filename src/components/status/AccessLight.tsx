import type { MembershipLight } from "@/domain/billing/membership-cycle";
import { formatARS } from "@/domain/shared/money";

/**
 * Semáforo de la cuota de profe. Cada estado tiene color, ícono y texto,
 * para que se entienda aunque no se distinga el color.
 */

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });

function shortDate(date: string): string {
  return dateFormat.format(new Date(`${date}T12:00:00Z`)).replace(".", "");
}

const styles = {
  current: { box: "bg-ok-soft border-ok", badge: "bg-ok", title: "text-ok-ink", label: "CUOTA AL DÍA" },
  grace: { box: "bg-warn-soft border-warn", badge: "bg-warn", title: "text-warn-ink", label: "PERÍODO DE GRACIA" },
  suspended: { box: "bg-alert-soft border-alert", badge: "bg-alert", title: "text-alert-ink", label: "ACCESO MENSUAL SUSPENDIDO" },
} as const;

function Icon({ light }: { light: MembershipLight["light"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#FFFFFF",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (light === "current") return <svg {...common}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  if (light === "grace") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
  return <svg {...common}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}

export function AccessLight({ state, planName, payHref }: { state: MembershipLight; planName: string; payHref?: string }) {
  const s = styles[state.light];
  return (
    <section aria-label="Estado de tu cuota" className={`flex flex-col gap-3 rounded-[var(--radius-card)] border-[1.5px] p-[18px] ${s.box}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex size-8 items-center justify-center rounded-full ${s.badge}`}>
          <Icon light={state.light} />
        </span>
        <span className={`font-display text-[22px] font-bold tracking-wide ${s.title}`}>{s.label}</span>
      </div>

      <p className="text-base font-semibold">{planName}</p>

      {state.light === "current" && state.nextDueDate && (
        <p className="flex justify-between text-[15px]">
          <span>Próximo vencimiento</span>
          <strong>{shortDate(state.nextDueDate)}</strong>
        </p>
      )}

      {state.light === "grace" && (
        <p className="text-[15px] leading-snug">
          Venció el {shortDate(state.dueDate)}. Te {state.daysLeft === 1 ? "queda" : "quedan"}{" "}
          <strong>{state.daysLeft} {state.daysLeft === 1 ? "día" : "días"}</strong>: podés entrar a tus clases hasta el{" "}
          <strong>{shortDate(state.graceEndsOn)}</strong> inclusive.
        </p>
      )}

      {state.light === "suspended" && (
        <p className="text-[15px] leading-snug">
          Venció el {shortDate(state.dueDate)} y terminó el período de gracia. Tu lugar fijo se mantiene: al acreditarse
          el pago, el acceso vuelve al instante.
        </p>
      )}

      {state.light !== "current" && (
        <>
          <p className="flex justify-between border-t border-black/10 pt-3 text-[15px]">
            <span>Importe pendiente</span>
            <strong className="text-lg">{formatARS(state.amountDueCents)}</strong>
          </p>
          {payHref && (
            <a
              href={payHref}
              className="flex h-12 items-center justify-center rounded-xl bg-brand font-bold text-white hover:bg-brand-hover"
            >
              {state.light === "grace" ? "Pagar ahora" : "Regularizar pago"}
            </a>
          )}
        </>
      )}
    </section>
  );
}
