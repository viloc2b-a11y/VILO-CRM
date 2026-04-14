import { createTask } from "@/lib/db/tasks";
import {
  validateViloOpportunity,
  validateViloOpportunityPatch,
} from "@/lib/db/validators";
import { createClient } from "@/lib/supabase/client";
import type {
  InsertViloOpportunity,
  OpportunityWithRefs,
  PriorityLevel,
  UpdateViloOpportunity,
  ViloOpportunity,
  ViloStage,
} from "@/lib/supabase/types";

export async function getViloOpportunities(filters?: {
  status?: ViloStage;
  priority?: PriorityLevel;
  archived?: boolean;
}): Promise<OpportunityWithRefs[]> {
  const sb = createClient();
  let q = sb
    .from("vilo_opportunities")
    .select("*, organization:organizations(id, name), contact:contacts(id, full_name)")
    .eq("archived", filters?.archived ?? false)
    .order("next_followup_date", { ascending: true, nullsFirst: false });
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.priority) q = q.eq("priority", filters.priority);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OpportunityWithRefs[];
}

export async function createViloOpportunity(payload: InsertViloOpportunity): Promise<ViloOpportunity> {
  validateViloOpportunity(payload);
  const sb = createClient();
  const { data, error } = await sb.from("vilo_opportunities").insert(payload).select().single();
  if (error) throw error;

  if (payload.status === "Feasibility Sent") {
    await autoCreateFeasibilityTask(data.id, data.company_name);
  }
  return data;
}

export async function updateViloOpportunity({ id, ...payload }: UpdateViloOpportunity): Promise<ViloOpportunity> {
  validateViloOpportunityPatch(payload);
  const sb = createClient();

  const { data: current } = await sb.from("vilo_opportunities").select("status, company_name").eq("id", id).single();

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("vilo_opportunities")
    .update({ ...payload, last_contact_date: today })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  if (current && payload.status && current.status !== payload.status && payload.status === "Feasibility Sent") {
    const name = data.company_name ?? current.company_name ?? "";
    await autoCreateFeasibilityTask(id, name);
  }
  return data;
}

export async function archiveViloOpportunity(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("vilo_opportunities").update({ archived: true }).eq("id", id);
  if (error) throw error;
}

async function autoCreateFeasibilityTask(viloId: string, companyName: string): Promise<void> {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);
  await createTask({
    title: `Follow up on feasibility — ${companyName}`,
    channel: "vilo",
    priority: "High",
    due_date: dueDate.toISOString().slice(0, 10),
    done: false,
    linked_vilo_id: viloId,
    linked_vitalis_id: null,
  });
}
