import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "../forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecuperarPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Recuperar contraseña</h1>
        <p className="text-[15px] text-muted">Te mandamos un enlace por email para que crees una contraseña nueva.</p>
      </div>
      <ResetRequestForm />
      <Link href="/ingresar" className="text-[15px] font-semibold">
        Volver a ingresar
      </Link>
    </section>
  );
}
