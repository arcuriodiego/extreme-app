import type { Metadata } from "next";
import Image from "next/image";
import QRCode from "qrcode";
import { academyConfig } from "@/config/academy";

export const metadata: Metadata = { title: "Cartel: instalá la app", robots: { index: false } };

const TARGET = `${academyConfig.appUrl}/instalar`;

/**
 * Cartel para recepción (A4, se imprime con Ctrl+P → Guardar como PDF) o para
 * historias de Instagram (?formato=historia, 1080×1920). El QR lleva a /instalar.
 */
export default async function CartelPage({ searchParams }: { searchParams: Promise<{ formato?: string }> }) {
  const { formato } = await searchParams;
  const story = formato === "historia";
  const svg = await QRCode.toString(TARGET, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#ffffff" } });

  return (
    <div className={`cartel mx-auto flex flex-col items-center bg-white text-ink ${story ? "cartel-historia" : "cartel-a4"}`}>
      <style>{`
        @page { size: A4; margin: 0; }
        html, body { background: #fff; }
        .cartel-a4 { width: 210mm; height: 297mm; padding: 18mm 16mm 14mm; justify-content: space-between; }
        .cartel-historia { width: 1080px; height: 1920px; padding: 140px 90px 120px; justify-content: space-between; }
        .cartel .qr svg { width: 100%; height: 100%; display: block; }
        @media print { .cartel { box-shadow: none; } }
      `}</style>

      <Image src={academyConfig.logo.light} alt={academyConfig.name} width={academyConfig.logo.width} height={academyConfig.logo.height} priority className={story ? "h-auto w-[520px]" : "h-auto w-[78mm]"} />

      <div className="flex flex-col items-center gap-3 text-center">
        <span className={`font-display font-bold uppercase leading-none tracking-wide ${story ? "text-[132px]" : "text-[22mm]"}`}>Instalá la app</span>
        <span className={`font-semibold text-muted ${story ? "text-[44px]" : "text-[6.2mm]"}`}>Tus clases, tu pase QR y tus pagos, siempre a mano</span>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className={`qr rounded-[24px] border-[3px] border-ink bg-white ${story ? "size-[620px] p-[36px]" : "size-[92mm] p-[6mm]"}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <span className={`rounded-full bg-[#D90000] px-6 py-2 font-display font-bold uppercase tracking-wide text-white ${story ? "text-[46px]" : "text-[7mm]"}`}>
          Escaneá con la cámara
        </span>
      </div>

      <div className={`grid w-full grid-cols-2 ${story ? "gap-10 text-[34px]" : "gap-[8mm] text-[4.3mm]"} leading-snug`}>
        <div className="flex flex-col gap-1.5">
          <span className={`font-display font-bold uppercase tracking-wide ${story ? "text-[48px]" : "text-[6.5mm]"}`}>iPhone</span>
          <span>1. Abrí el link en Safari</span>
          <span>2. Tocá Compartir</span>
          <span>3. &quot;Agregar a inicio&quot;</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={`font-display font-bold uppercase tracking-wide ${story ? "text-[48px]" : "text-[6.5mm]"}`}>Android</span>
          <span>1. Abrí el link en Chrome</span>
          <span>2. Tocá el menú ⋮</span>
          <span>3. &quot;Instalar app&quot;</span>
        </div>
      </div>

      <span className={`font-semibold ${story ? "text-[38px]" : "text-[5mm]"}`}>{TARGET.replace(/^https:\/\//, "")}</span>
    </div>
  );
}
