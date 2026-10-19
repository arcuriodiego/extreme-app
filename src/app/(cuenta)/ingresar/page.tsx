import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/domain/auth/routes";
import { SignInForm } from "../forms";

export const metadata: Metadata = { title: "Ingresar" };

const notices: Record<string, string> = {
  enlace: "El enlace venció o ya se usó. Ingresá con tu contraseña o pedí uno nuevo.",
};

export default async function IngresarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next) ?? undefined;
  const notice = params.error ? notices[params.error] : undefined;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Ingresar</h1>
      <SignInForm next={next} notice={notice} />
      <p className="text-[15px]">
        ¿Primera vez?{" "}
        <Link href="/registro" className="font-semibold">
          Creá tu cuenta
        </Link>
      </p>
    </section>
  );
}
