import Image from "next/image";
import Link from "next/link";
import { academyConfig } from "@/config/academy";

/** Marco común de las pantallas de acceso: logo arriba y formulario angosto. */
export default function CuentaLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-5 pb-12 pt-8">
      <Link href="/" aria-label={`${academyConfig.name}, ir al inicio`} className="self-center">
        <Image
          src={academyConfig.logo.light}
          alt={academyConfig.name}
          width={academyConfig.logo.width}
          height={academyConfig.logo.height}
          priority
          className="h-auto w-44"
        />
      </Link>
      {children}
    </main>
  );
}
