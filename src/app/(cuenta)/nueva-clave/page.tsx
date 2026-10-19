import type { Metadata } from "next";
import { NewPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Contraseña nueva" };

// Se llega desde el enlace de recuperación: el proxy ya verificó que haya sesión.
export default function NuevaClavePage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Contraseña nueva</h1>
      <NewPasswordForm />
    </section>
  );
}
