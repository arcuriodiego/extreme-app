import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/basics";

export const metadata: Metadata = { title: "Mis pases" };

const ITEMS = [
  "Tu código QR para mostrar en la puerta",
  "Tus clases fijas y reservadas",
  "Packs y clases que te quedan",
  "Créditos por clases canceladas a tiempo"
];

export default function Page() {
  return <ComingSoon title="Mis pases" intro="Acá vas a tener tu pase para entrar a la academia." items={ITEMS} />;
}
