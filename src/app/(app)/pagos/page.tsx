import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/basics";

export const metadata: Metadata = { title: "Pagos" };

const ITEMS = [
  "Pagar cuota, packs y clases con Mercado Pago",
  "Estado de tu cuota y próximo vencimiento",
  "Historial de pagos y comprobantes"
];

export default function Page() {
  return <ComingSoon title="Pagos" intro="Acá vas a poder pagar y ver el estado de tu cuota." items={ITEMS} />;
}
