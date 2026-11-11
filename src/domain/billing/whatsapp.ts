/**
 * Mensajes de WhatsApp para recibos y recordatorios de cuota.
 *
 * Se mandan con enlaces wa.me (abren WhatsApp con el texto listo, desde el celular
 * de quien cobra): no hace falta la API paga de WhatsApp.
 */
import { formatARS, type Cents } from "../shared/money.ts";

/**
 * Teléfono argentino en formato internacional para WhatsApp (54 9 + característica + número),
 * o null si no se puede interpretar. Acepta "223 15 512-3456", "0223 5123456",
 * "+54 9 223 512 3456", "2235123456", etc.
 */
export function whatsappNumber(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 0) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  }
  if (d.startsWith("0")) d = d.slice(1);
  // Sacar el "15" de celular que va después de la característica (de 2, 3 o 4 dígitos).
  if (d.length === 12) {
    for (const area of [3, 2, 4]) {
      if (d.slice(area, area + 2) === "15") {
        d = d.slice(0, area) + d.slice(area + 2);
        break;
      }
    }
  }
  if (d.length !== 10) return null;
  return `549${d}`;
}

/** Enlace que abre WhatsApp con el texto listo (sin número: elige el contacto quien envía). */
export function whatsappLink(phone: string | null, text: string): string {
  const number = whatsappNumber(phone);
  const base = number ? `https://wa.me/${number}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export interface TransferInfo {
  alias: string | null;
  cbu: string | null;
  holder: string | null;
  bank: string | null;
}

export function hasTransferInfo(t: TransferInfo | null | undefined): t is TransferInfo {
  return Boolean(t && (t.alias || t.cbu));
}

/** Renglones con los datos para transferir (vacío si no están cargados). */
export function transferLines(t: TransferInfo | null | undefined): string[] {
  if (!hasTransferInfo(t)) return [];
  return [
    t.alias ? `Alias: ${t.alias}` : null,
    t.cbu ? `CBU/CVU: ${t.cbu}` : null,
    t.holder ? `Titular: ${t.holder}` : null,
    t.bank ? `Banco: ${t.bank}` : null,
  ].filter((x): x is string => x !== null);
}

/** Primer nombre de una persona ("Valentina Gómez" → "Valentina"). */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

/** Texto para mandar un recibo. */
export function receiptMessage(input: {
  academy: string;
  contactName: string | null;
  number: number;
  studentNames: string[];
  totalCents: Cents;
  url: string;
}): string {
  const hi = input.contactName ? `¡Hola, ${firstName(input.contactName)}!` : "¡Hola!";
  const who = joinNames(input.studentNames.map(firstName));
  return [
    `${hi} Te mandamos el recibo N° ${input.number} de ${input.academy}${who ? ` (${who})` : ""} por ${formatARS(input.totalCents)}.`,
    "",
    `Podés verlo acá: ${input.url}`,
    "",
    "¡Gracias!",
  ].join("\n");
}

export interface ReminderCharge {
  studentName: string;
  description: string;
  /** Fecha de vencimiento AAAA-MM-DD. */
  dueDate: string;
  totalCents: Cents;
  /** Precio en efectivo (null si es el mismo). */
  cashCents: Cents | null;
}

/** Texto del recordatorio de cuota para una familia (una o varias cuotas). */
export function reminderMessage(input: {
  academy: string;
  contactName: string | null;
  charges: readonly ReminderCharge[];
  today: string;
  transfer: TransferInfo | null;
  appUrl: string;
}): string {
  const hi = input.contactName ? `¡Hola, ${firstName(input.contactName)}!` : "¡Hola!";
  const list = input.charges.map((c) => {
    const when = c.dueDate < input.today ? `venció el ${dayMonth(c.dueDate)}` : c.dueDate === input.today ? "vence hoy" : `vence el ${dayMonth(c.dueDate)}`;
    const price = c.cashCents !== null && c.cashCents !== c.totalCents ? `${formatARS(c.cashCents)} en efectivo o ${formatARS(c.totalCents)} con otros medios` : formatARS(c.totalCents);
    return `• ${firstName(c.studentName)} · ${c.description}: ${price} (${when})`;
  });
  const overdue = input.charges.some((c) => c.dueDate < input.today);
  const lines = [
    `${hi} Te escribimos de ${input.academy} para recordarte ${input.charges.length === 1 ? "la cuota" : "las cuotas"}:`,
    "",
    ...list,
  ];
  const transfer = transferLines(input.transfer);
  if (transfer.length > 0) lines.push("", "Si querés transferir:", ...transfer, "Mandanos el comprobante por acá.");
  lines.push("", `También podés verlo en la app: ${input.appUrl}`);
  lines.push("", overdue ? "Si ya pagaste, desestimá este mensaje. ¡Gracias!" : "¡Gracias!");
  return lines.join("\n");
}

function dayMonth(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}/${Number(m)}`;
}

function joinNames(names: string[]): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} y ${unique.at(-1)}`;
}
