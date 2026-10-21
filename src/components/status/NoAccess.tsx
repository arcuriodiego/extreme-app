import Link from "next/link";

/** Se muestra cuando alguien entra a una sección para la que no tiene permiso. */
export function NoAccess() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Sin acceso</h1>
      <p className="text-[15px] text-muted">
        Esta sección es para el personal de la academia. Si creés que deberías poder verla, pedile acceso a administración.
      </p>
      <Link href="/inicio" className="font-semibold">
        Volver al inicio
      </Link>
    </section>
  );
}
