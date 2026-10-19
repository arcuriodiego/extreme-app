import Image from "next/image";
import { academyConfig } from "@/config/academy";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-10">
      <Image
        src={academyConfig.logo.light}
        alt={academyConfig.name}
        width={academyConfig.logo.width}
        height={academyConfig.logo.height}
        priority
        className="h-auto w-64"
      />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold uppercase tracking-wide">Muy pronto</h1>
        <p className="text-lg text-muted">
          Acá vas a poder reservar clases, pagar tu cuota y mostrar tu pase para entrar.
        </p>
      </div>
    </main>
  );
}
