import Image from "next/image";
import Link from "next/link";
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
      <p className="text-lg text-muted">Reservá clases, pagá tu cuota y mostrá tu pase para entrar.</p>
      <div className="flex flex-col gap-3">
        <Link
          href="/ingresar"
          className="flex h-12 items-center justify-center rounded-xl bg-brand font-bold text-white no-underline hover:bg-brand-hover hover:text-white"
        >
          Ingresar
        </Link>
        <Link
          href="/registro"
          className="flex h-12 items-center justify-center rounded-xl border-[1.5px] border-ink font-semibold text-ink no-underline hover:bg-surface hover:text-ink"
        >
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}
