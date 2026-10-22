/** Esqueleto que se ve al instante mientras el servidor arma la página. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex animate-pulse flex-col gap-4">
      <span className="sr-only">Cargando…</span>
      <div className="h-9 w-48 rounded-lg bg-surface" />
      <div className="h-4 w-64 max-w-full rounded bg-surface" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 rounded-xl bg-surface" />
      ))}
    </div>
  );
}
