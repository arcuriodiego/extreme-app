import { notFound } from "next/navigation";
import { AccessLight } from "@/components/status/AccessLight";
import { membershipLight } from "@/domain/billing/membership-cycle";

// Vista para revisar componentes con datos de ejemplo. No existe en producción.
export default function ComponentesPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const cuota = [{ dueDate: "2026-11-10", totalCents: 5_550_000, paidCents: 0 }];
  const plan = "Cuota de profe · Hip Hop Intermedio";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-5 py-10">
      <h1 className="font-display text-3xl font-bold uppercase">Semáforo · ejemplos</h1>
      <AccessLight planName={plan} state={membershipLight({ today: "2026-11-05", charges: cuota, nextDueDate: "2026-11-10" })} />
      <AccessLight planName={plan} payHref="#" state={membershipLight({ today: "2026-11-13", charges: cuota, nextDueDate: null })} />
      <AccessLight planName={plan} payHref="#" state={membershipLight({ today: "2026-11-16", charges: cuota, nextDueDate: null })} />
    </main>
  );
}
