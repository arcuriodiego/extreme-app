import type { Metadata } from "next";
import Image from "next/image";
import { academyConfig } from "@/config/academy";
import { InstallGuide } from "./InstallGuide";

export const metadata: Metadata = {
  title: "Instalá la app",
  description: `Cómo instalar la app de ${academyConfig.name} en tu celular.`,
};

/** Página pública (el QR de recepción y de Instagram lleva acá). */
export default function InstalarPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pb-12 pt-6">
      <Image
        src={academyConfig.logo.light}
        alt={academyConfig.name}
        width={academyConfig.logo.width}
        height={academyConfig.logo.height}
        priority
        className="mx-auto h-auto w-32"
      />
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Instalá la app</h1>
        <p className="text-[15px] text-muted">Tus clases, tu pase QR y tus pagos, siempre a mano. No hace falta buscarla en ninguna tienda: se instala en 1 minuto desde el navegador.</p>
      </div>
      <InstallGuide />
    </main>
  );
}
