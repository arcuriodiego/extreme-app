import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type NotificationKind = "due_soon" | "grace" | "suspended" | "pack_expiring" | "class_cancelled" | "class_restored" | "announcement";

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

/** Mis avisos, del más nuevo al más viejo (la base sólo devuelve los míos). */
export async function loadMyNotifications(supabase: Client, limit = 50): Promise<NotificationRow[]> {
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as { id: string; kind: NotificationKind; title: string; body: string; link: string | null; created_at: string; read_at: string | null }[]).map(
    (r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, createdAt: r.created_at, read: r.read_at !== null }),
  );
}

export async function countUnread(supabase: Client): Promise<number> {
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

/** Genera los avisos del día (cuotas, gracia, suspensión, packs) si todavía no se generaron. */
export async function ensureNotifications(supabase: Client): Promise<void> {
  await supabase.rpc("ensure_notifications");
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  groupName: string | null;
  authorName: string;
  recipients: number;
  createdAt: string;
}

/** Avisos enviados (la base devuelve los míos, o todos si veo personas). */
export async function loadAnnouncements(supabase: Client, limit = 30): Promise<AnnouncementRow[]> {
  const { data } = await supabase
    .from("announcements")
    .select(
      "id, title, body, recipients_count, created_at, group:class_groups(style:dance_styles(name), age:age_categories(name), level:levels(name)), author:profiles(first_name, last_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  type Raw = {
    id: string;
    title: string;
    body: string;
    recipients_count: number;
    created_at: string;
    group: { style: { name: string } | null; age: { name: string } | null; level: { name: string } | null } | null;
    author: { first_name: string | null; last_name: string | null } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    groupName: r.group ? [r.group.style?.name, r.group.age?.name, r.group.level?.name].filter(Boolean).join(" · ") : null,
    authorName: [r.author?.first_name, r.author?.last_name].filter(Boolean).join(" "),
    recipients: r.recipients_count,
    createdAt: r.created_at,
  }));
}
