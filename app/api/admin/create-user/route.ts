import { createServerSideClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const sb = await createServerSideClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await serviceClient.from("user_profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, password, full_name, role } = await req.json();

  if (!email || !password || !full_name || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  const { data: newUser, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, user_id: newUser.user?.id }, { status: 201 });
}
