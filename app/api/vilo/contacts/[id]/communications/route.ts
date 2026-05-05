import { createServerSideClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Lista `communications_log` para un contacto (máx. 50, más recientes primero).
 * Requiere sesión Supabase; RLS aplica (`user_can_access_bu` vilo_research).
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: contactId } = await ctx.params;
  if (!contactId?.trim()) {
    return NextResponse.json({ error: "Missing contact id" }, { status: 400 });
  }

  const supabase = await createServerSideClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: logs, error } = await supabase
    .from("communications_log")
    .select("*")
    .eq("contact_id", contactId.trim())
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(logs ?? []);
}
