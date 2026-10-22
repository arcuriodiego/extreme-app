import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/basics";

export const metadata: Metadata = { title: "Clases" };

const ITEMS = [
  "Grilla semanal por estilo, nivel y profe",
  "Reservar una clase suelta o con tu pack",
  "Workshops y eventos especiales",
  "Lugares disponibles en cada clase"
];

export default function Page() {
  return <ComingSoon title="Clases" intro="Acá vas a ver la grilla de la academia y reservar tus clases." items={ITEMS} />;
}
