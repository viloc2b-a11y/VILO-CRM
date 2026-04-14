import { createClient } from "@/lib/supabase/client";
import type { DashboardMetrics } from "@/lib/supabase/types";

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const sb = createClient();
  const { data, error } = await sb.from("v_dashboard_metrics").select("*").single();
  if (error) throw error;
  return data as DashboardMetrics;
}
