import { NextResponse } from "next/server";
import { getServiceClientOrNull } from "@/lib/supabase/service-role";

export async function GET() {
  const serviceClient = getServiceClientOrNull();

  if (!serviceClient) {
    return NextResponse.json({
      metrics: null,
      execution: null,
      pipeline: [],
      tasks: [],
      screen_fails: [],
      warning: "Supabase service role is not configured for server dashboard data.",
    });
  }

  try {
    const [
      { data: metrics },
      { data: execution },
      { data: pipeline },
      { data: tasks },
      { data: screenFails },
    ] = await Promise.all([
      serviceClient.from("v_enrollment_engine_7d").select("*").single(),
      serviceClient.from("v_execution_metrics").select("*").single(),
      serviceClient.from("v_pipeline_by_stage").select("*"),
      serviceClient.from("v_tasks_alert_panel").select("*").limit(15),
      serviceClient.from("v_screen_fail_insights").select("*").limit(5),
    ]);

    return NextResponse.json({
      metrics,
      execution,
      pipeline: pipeline ?? [],
      tasks: tasks ?? [],
      screen_fails: screenFails ?? [],
    });
  } catch {
    return NextResponse.json({
      metrics: null,
      execution: null,
      pipeline: [],
      tasks: [],
      screen_fails: [],
      warning: "Dashboard data could not be loaded.",
    });
  }
}
