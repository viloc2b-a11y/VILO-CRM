import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service-role";

export async function GET() {
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
}
