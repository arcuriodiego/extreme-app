import type { Platform } from "@/domain/install/platform";

/** Ícono de Compartir de Safari (cuadrado con flecha hacia arriba). */
function ShareIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-1">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="inline -mt-1">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">{n}</span>
      <span className="pt-0.5 text-[15px] leading-snug">{children}</span>
    </li>
  );
}

/** Pasos para agregar la app a la pantalla de inicio, según el celular. */
export function InstallSteps({ platform }: { platform: Platform }) {
  if (platform === "android") {
    return (
      <ol className="flex flex-col gap-3">
        <Step n={1}>
          Abrí <strong>app.extremedance.com.ar</strong> en <strong>Chrome</strong>.
        </Step>
        <Step n={2}>
          Tocá el menú <strong>⋮</strong> (arriba a la derecha).
        </Step>
        <Step n={3}>
          Elegí <strong>&quot;Instalar app&quot;</strong> (o &quot;Agregar a la pantalla principal&quot;) y confirmá.
        </Step>
        <Step n={4}>Listo: abrila desde el ícono de Extreme Dance, como cualquier app.</Step>
      </ol>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {platform === "ios-other" ? (
        <Step n={1}>
          Abrí <strong>app.extremedance.com.ar</strong> en <strong>Safari</strong> (la brújula azul). Desde Instagram u otro navegador no se puede
          instalar.
        </Step>
      ) : (
        <Step n={1}>
          Abrí <strong>app.extremedance.com.ar</strong> en <strong>Safari</strong>.
        </Step>
      )}
      <Step n={2}>
        Tocá <strong>Compartir</strong> <ShareIcon /> (abajo en la pantalla). Si no lo ves, tocá <strong>•••</strong> y después Compartir.
      </Step>
      <Step n={3}>
        Deslizá hacia abajo y tocá <strong>&quot;Agregar a inicio&quot;</strong> <PlusIcon />. Después, <strong>&quot;Agregar&quot;</strong>.
      </Step>
      <Step n={4}>Listo: abrila desde el ícono de Extreme Dance en tu pantalla de inicio.</Step>
    </ol>
  );
}
