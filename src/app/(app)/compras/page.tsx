import { redirect } from "next/navigation";

/** Las compras están en Pagos (sección "Comprar"). */
export default function ComprasPage() {
  redirect("/pagos#comprar");
}
