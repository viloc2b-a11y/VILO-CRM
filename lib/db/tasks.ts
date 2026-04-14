import { createClient } from "@/lib/supabase/client";
import type { InsertTask, Task, TaskChannel, TaskWithRef } from "@/lib/supabase/types";
import { validateTask } from "@/lib/db/validators";

export async function getTasks(filters?: {
  done?: boolean;
  channel?: TaskChannel;
}): Promise<TaskWithRef[]> {
  const sb = createClient();
  let q = sb
    .from("tasks")
    .select(
      `
      *,
      vilo_opportunity:vilo_opportunities(id, company_name, status),
      patient_lead:patient_leads(id, full_name, current_stage)
    `
    )
    .order("due_date", { ascending: true });
  if (filters?.done !== undefined) q = q.eq("done", filters.done);
  if (filters?.channel) q = q.eq("channel", filters.channel);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TaskWithRef[];
}

export async function createTask(payload: InsertTask): Promise<Task> {
  validateTask(payload);
  const sb = createClient();
  const { data, error } = await sb.from("tasks").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function toggleTask(id: string, done: boolean): Promise<Task> {
  const sb = createClient();
  const { data, error } = await sb.from("tasks").update({ done }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
