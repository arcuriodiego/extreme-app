import { NextResponse } from "next/server";
import { countUnread } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Cantidad de avisos sin leer de quien inició sesión (para la campanita). */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) return NextResponse.json({ count: 0 }, { headers: { "Cache-Control": "no-store" } });
    const count = await countUnread(supabase);
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ count: 0 }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
