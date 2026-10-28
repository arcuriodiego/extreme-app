"use server";

import { createClient } from "@/lib/supabase/server";

export async function markNoticesRead(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read");
}
