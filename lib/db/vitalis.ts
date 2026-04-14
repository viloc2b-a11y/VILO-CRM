import {
  validatePatientLead,
  validatePatientLeadPatch,
} from "@/lib/db/validators";
import { createClient } from "@/lib/supabase/client";
import type {
  InsertPatientLead,
  PatientLead,
  PreferredLanguage,
  UpdatePatientLead,
  VitalisStage,
} from "@/lib/supabase/types";

export async function getPatientLeads(filters?: {
  current_stage?: VitalisStage;
  preferred_language?: PreferredLanguage;
  archived?: boolean;
}): Promise<PatientLead[]> {
  const sb = createClient();
  let q = sb
    .from("patient_leads")
    .select("*")
    .eq("archived", filters?.archived ?? false)
    .order("created_at", { ascending: false });
  if (filters?.current_stage) q = q.eq("current_stage", filters.current_stage);
  if (filters?.preferred_language) q = q.eq("preferred_language", filters.preferred_language);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createPatientLead(payload: InsertPatientLead): Promise<PatientLead> {
  validatePatientLead(payload);
  const sb = createClient();
  const { data, error } = await sb.from("patient_leads").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updatePatientLead({ id, ...payload }: UpdatePatientLead): Promise<PatientLead> {
  validatePatientLeadPatch(payload);
  const sb = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("patient_leads")
    .update({ ...payload, last_contact_date: today })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archivePatientLead(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("patient_leads").update({ archived: true }).eq("id", id);
  if (error) throw error;
}
