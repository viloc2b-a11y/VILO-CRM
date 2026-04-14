import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service-role";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { done } = (await req.json()) as { done?: boolean };
  if (typeof done !== "boolean") {
    return NextResponse.json({ error: "Body must include boolean `done`" }, { status: 400 });
  }
  const { data, error } = await serviceClient.from("tasks").update({ done }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, task: data });
}
