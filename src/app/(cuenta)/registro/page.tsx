import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "../forms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegistroPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Crear cuenta</h1>
      <SignUpForm />
      <p className="text-[15px]">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="font-semibold">
          Ingresá
        </Link>
      </p>
    </section>
  );
}
