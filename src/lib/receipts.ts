import "server-only";
import { academyConfig } from "@/config/academy";
import { cashDue } from "@/domain/billing/cash-price";
import type { ReminderCharge, TransferInfo } from "@/domain/billing/whatsapp";
import { addDays, type CalendarDate } from "@/domain/shared/calendar-date";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Link público del recibo (se abre sin iniciar sesión). */
export function receiptUrl(token: string): string {
  return `${academyConfig.appUrl}/recibo/${token}`;
}

/** Datos para transferir de la academia (null si no hay ninguno cargado). */
export async function loadTransferInfo(supabase: Client): Promise<TransferInfo> {
  const { data } = await supabase.from("academies").select("transfer_alias, transfer_cbu, transfer_holder, transfer_bank").limit(1).maybeSingle();
  const r = (data ?? {}) as Record<string, string | null>;
  return { alias: r.transfer_alias ?? null, cbu: r.transfer_cbu ?? null, holder: r.transfer_holder ?? null, bank: r.transfer_bank ?? null };
}

export interface Contact {
  name: string;
  /** "Mamá de Valentina", "Alumna", etc. */
  label: string;
  phone: string | null;
}

interface RawGuardianLink {
  student_id: string;
  guardian_id: string;
  relationship: "madre" | "padre" | "tutor" | null;
  is_primary: boolean;
  receives_notifications: boolean;
  guardian: { profile: { first_name: string | null; last_name: string | null; phone: string | null } | null } | null;
}

const RELATION: Record<string, string> = { madre: "Mamá", padre: "Papá", tutor: "Tutor/a" };

async function guardianLinks(supabase: Client, studentIds: string[]): Promise<RawGuardianLink[]> {
  if (studentIds.length === 0) return [];
  const { data } = await supabase
    .from("guardian_students")
    .select("student_id, guardian_id, relationship, is_primary, receives_notifications, guardian:guardians(profile:profiles(first_name, last_name, phone))")
    .in("student_id", studentIds)
    .order("is_primary", { ascending: false })
    .order("created_at");
  return (data ?? []) as unknown as RawGuardianLink[];
}

function personName(p: { first_name: string | null; last_name: string | null } | null | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
}

/** A quién se le puede mandar algo de estos alumnos: tutores (primero el principal) y el alumno si tiene teléfono. */
export async function loadContacts(
  supabase: Client,
  students: readonly { id: string; name: string; phone: string | null }[],
): Promise<Contact[]> {
  const links = await guardianLinks(supabase, students.map((s) => s.id));
  const contacts: Contact[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    const name = personName(l.guardian?.profile) || "Tutor";
    const key = `g:${l.guardian_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kid = students.find((s) => s.id === l.student_id)?.name.split(" ")[0] ?? "";
    contacts.push({ name, label: `${RELATION[l.relationship ?? ""] ?? "Tutor/a"} de ${kid}`.trim(), phone: l.guardian?.profile?.phone ?? null });
  }
  for (const s of students) {
    if (s.phone) contacts.push({ name: s.name, label: "Alumno/a", phone: s.phone });
  }
  return contacts;
}

export interface ReceiptDetail {
  id: string;
  number: number;
  token: string;
  issuedAt: string;
  totalCents: number;
  voided: boolean;
  methods: string[];
  students: { id: string; name: string; phone: string | null }[];
  items: { studentName: string; description: string; amountCents: number }[];
}

/** Recibo para el personal (con los alumnos, para buscar a quién mandarlo). */
export async function loadReceipt(supabase: Client, id: string): Promise<ReceiptDetail | null> {
  const { data: r } = await supabase.from("receipts").select("id, number, token, issued_at").eq("id", id).maybeSingle();
  if (!r) return null;
  const { data: pays } = await supabase
    .from("payments")
    .select("id, method, amount_cents, status, student:students(id, first_name, last_name, phone), allocations:payment_allocations(amount_cents, charge:charges(description))")
    .eq("receipt_id", id);
  type Raw = {
    method: string;
    amount_cents: number;
    status: "approved" | "void";
    student: { id: string; first_name: string; last_name: string; phone: string | null } | null;
    allocations: { amount_cents: number; charge: { description: string } | null }[] | null;
  };
  const rows = (pays ?? []) as unknown as Raw[];
  const students = new Map<string, { id: string; name: string; phone: string | null }>();
  const items: ReceiptDetail["items"] = [];
  for (const p of rows) {
    const name = personName(p.student);
    if (p.student) students.set(p.student.id, { id: p.student.id, name, phone: p.student.phone });
    for (const a of p.allocations ?? []) items.push({ studentName: name, description: a.charge?.description ?? "Pago", amountCents: Number(a.amount_cents) });
  }
  return {
    id: r.id as string,
    number: Number(r.number),
    token: r.token as string,
    issuedAt: r.issued_at as string,
    totalCents: rows.filter((p) => p.status === "approved").reduce((s, p) => s + Number(p.amount_cents), 0),
    voided: rows.some((p) => p.status === "void"),
    methods: [...new Set(rows.map((p) => p.method))],
    students: [...students.values()],
    items,
  };
}

// ---------------------------------------------------------------------
// Recordatorios de cuota
// ---------------------------------------------------------------------

export interface ReminderFamily {
  /** Clave estable de la familia: tutor principal o el propio alumno. */
  key: string;
  contact: Contact;
  charges: (ReminderCharge & { id: string; studentId: string })[];
  lastSentAt: string | null;
}

/**
 * Familias con cuotas impagas vencidas o por vencer (dentro de la regla due_reminder_days),
 * agrupadas por tutor: hermanos con la misma mamá reciben un solo mensaje.
 */
export async function loadReminderFamilies(supabase: Client, today: CalendarDate): Promise<ReminderFamily[]> {
  const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "due_reminder_days").maybeSingle();
  const horizon = Number((setting as { value: number } | null)?.value ?? 5);
  const { data, error } = await supabase
    .from("charges")
    .select("id, student_id, description, due_date, total_cents, paid_cents, cash_amount_cents, student:students(first_name, last_name, phone, status)")
    .in("status", ["open", "partially_paid"])
    .lte("due_date", addDays(today, horizon))
    .order("due_date");
  if (error) throw new Error(`No se pudieron cargar las cuotas: ${error.message}`);
  type Raw = {
    id: string;
    student_id: string;
    description: string;
    due_date: string;
    total_cents: number;
    paid_cents: number;
    cash_amount_cents: number | null;
    student: { first_name: string; last_name: string; phone: string | null; status: string } | null;
  };
  const charges = ((data ?? []) as unknown as Raw[]).filter((c) => c.student && c.student.status !== "inactive");
  const links = await guardianLinks(supabase, [...new Set(charges.map((c) => c.student_id))]);

  const families = new Map<string, ReminderFamily>();
  for (const c of charges) {
    const name = personName(c.student);
    const link = links.find((l) => l.student_id === c.student_id && l.receives_notifications);
    const key = link ? `g:${link.guardian_id}` : `s:${c.student_id}`;
    const contact: Contact = link
      ? { name: personName(link.guardian?.profile) || "Tutor", label: `${RELATION[link.relationship ?? ""] ?? "Tutor/a"} de ${name.split(" ")[0]}`, phone: link.guardian?.profile?.phone ?? null }
      : { name, label: "Alumno/a", phone: c.student?.phone ?? null };
    const family = families.get(key) ?? { key, contact, charges: [], lastSentAt: null };
    const first = name.split(" ")[0] ?? "";
    if (link && first && !family.contact.label.includes(first)) family.contact.label += ` y ${first}`;
    const total = Number(c.total_cents);
    const paid = Number(c.paid_cents);
    family.charges.push({
      id: c.id,
      studentId: c.student_id,
      studentName: name,
      description: c.description,
      dueDate: c.due_date,
      totalCents: total - paid,
      cashCents: cashDue({ cashCents: c.cash_amount_cents == null ? null : Number(c.cash_amount_cents), paidCents: paid, pendingCents: total - paid }),
    });
    families.set(key, family);
  }

  const list = [...families.values()];
  if (list.length > 0) {
    const { data: sent } = await supabase
      .from("fee_reminders")
      .select("family_key, sent_at")
      .in("family_key", list.map((f) => f.key))
      .order("sent_at", { ascending: false })
      .limit(500);
    for (const s of (sent ?? []) as { family_key: string; sent_at: string }[]) {
      const f = families.get(s.family_key);
      if (f && !f.lastSentAt) f.lastSentAt = s.sent_at;
    }
  }
  // Primero las vencidas (por la cuota más vieja).
  return list.sort((a, b) => (a.charges[0]?.dueDate ?? "").localeCompare(b.charges[0]?.dueDate ?? ""));
}

/** Cuotas impagas del alumno y sus hermanos (otros alumnos de sus mismos tutores), para cobrar juntas. */
export async function loadFamilyOpenCharges(
  supabase: Client,
  studentId: string,
): Promise<{ id: string; studentId: string; studentName: string; description: string; dueDate: string; pendingCents: number; cashCents: number | null }[]> {
  const { data: mine } = await supabase.from("guardian_students").select("guardian_id").eq("student_id", studentId);
  const guardianIds = [...new Set(((mine ?? []) as { guardian_id: string }[]).map((g) => g.guardian_id))];
  let ids = [studentId];
  if (guardianIds.length > 0) {
    const { data: kids } = await supabase.from("guardian_students").select("student_id").in("guardian_id", guardianIds);
    ids = [...new Set([studentId, ...((kids ?? []) as { student_id: string }[]).map((k) => k.student_id)])];
  }
  const { data } = await supabase
    .from("charges")
    .select("id, student_id, description, due_date, total_cents, paid_cents, cash_amount_cents, student:students(first_name, last_name)")
    .in("student_id", ids)
    .in("status", ["open", "partially_paid"])
    .order("due_date");
  type Raw = { id: string; student_id: string; description: string; due_date: string; total_cents: number; paid_cents: number; cash_amount_cents: number | null; student: { first_name: string; last_name: string } | null };
  return ((data ?? []) as unknown as Raw[]).map((c) => {
    const total = Number(c.total_cents);
    const paid = Number(c.paid_cents);
    return {
      id: c.id,
      studentId: c.student_id,
      studentName: personName(c.student),
      description: c.description,
      dueDate: c.due_date,
      pendingCents: total - paid,
      cashCents: cashDue({ cashCents: c.cash_amount_cents == null ? null : Number(c.cash_amount_cents), paidCents: paid, pendingCents: total - paid }),
    };
  });
}
