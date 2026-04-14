import { createServerSideClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const sb = await createServerSideClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await serviceClient
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const body = await req.json();
    const { action, entity_type, entity_id, entity_label, metadata } = body as {
      action?: string;
      entity_type?: string;
      entity_id?: string;
      entity_label?: string;
      metadata?: Record<string, unknown>;
    };

    const { error } = await serviceClient.from("activity_log").insert({
      user_id: user.id,
      user_name: profile?.full_name ?? user.email ?? "Unknown",
      action: action ?? "unknown",
      entity_type: entity_type ?? "unknown",
      entity_id: entity_id ?? null,
      entity_label: entity_label ?? null,
      metadata: metadata ?? null,
    });

    if (error) console.error("[activity_log insert]", error);
  } catch (e) {
    console.error("[activity]", e);
  }

  return NextResponse.json({ success: true });
}
