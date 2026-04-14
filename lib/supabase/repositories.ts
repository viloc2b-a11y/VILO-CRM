/**
 * Thin Supabase CRUD layer. Pass a client from `createClient()` (browser).
 * (after sign-in) or a server-side client with the user's JWT.
 * Does not modify Zustand or UI — call from hooks/sync jobs when ready.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, Organization, PatientLead, TaskItem, ViloOpportunity } from "@/lib/types";
import type {
  ContactRow,
  DashboardMetricsRow,
  OrganizationRow,
  PatientLeadRow,
  TaskRow,
  ViloOpportunityRow,
} from "@/lib/supabase/types";
import {
  contactRowToApp,
  contactToDbInsert,
  contactToDbUpdate,
  organizationRowToApp,
  organizationToDbInsert,
  organizationToDbUpdate,
  patientRowToApp,
  patientToDbInsert,
  patientToDbUpdate,
  taskRowToApp,
  taskToDbInsert,
  taskToDbUpdate,
  viloRowToApp,
  viloToDbInsert,
  viloToDbUpdate,
} from "@/lib/supabase/mappers";

export type DbClient = SupabaseClient;

function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export const organizationsRepo = {
  async listActive(client: DbClient): Promise<{ data: Organization[]; error: string | null }> {
    const { data, error } = await client
      .from("organizations")
      .select("*")
      .eq("archived", false)
      .order("name");
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []).map((r) => organizationRowToApp(r as OrganizationRow)), error: null };
  },

  async insert(client: DbClient, o: Omit<Organization, "id" | "createdAt">): Promise<{ data: Organization | null; error: string | null }> {
    const row = organizationToDbInsert(o);
    const { data, error } = await client.from("organizations").insert(row).select("*").single();
    if (error) return { data: null, error: error.message };
    return { data: data ? organizationRowToApp(data as OrganizationRow) : null, error: null };
  },

  async update(client: DbClient, id: string, patch: Partial<Organization>): Promise<{ error: string | null }> {
    const { error } = await client.from("organizations").update(organizationToDbUpdate(patch)).eq("id", id);
    return { error: error?.message ?? null };
  },

  async softArchive(client: DbClient, id: string): Promise<{ error: string | null }> {
    const { error } = await client.from("organizations").update({ archived: true }).eq("id", id);
    return { error: error?.message ?? null };
  },
};

export const contactsRepo = {
  async listByOrg(client: DbClient, orgId: string): Promise<{ data: Contact[]; error: string | null }> {
    const { data, error } = await client
      .from("contacts")
      .select("*")
      .eq("archived", false)
      .eq("org_id", orgId)
      .order("full_name");
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []).map((r) => contactRowToApp(r as ContactRow)), error: null };
  },

  async listAllActive(client: DbClient): Promise<{ data: Contact[]; error: string | null }> {
    const { data, error } = await client.from("contacts").select("*").eq("archived", false).order("full_name");
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []).map((r) => contactRowToApp(r as ContactRow)), error: null };
  },

  async insert(client: DbClient, c: Omit<Contact, "id" | "createdAt">): Promise<{ data: Contact | null; error: string | null }> {
    const row = contactToDbInsert(c);
    const { data, error } = await client.from("contacts").insert(row).select("*").single();
    if (error) return { data: null, error: error.message };
    return { data: data ? contactRowToApp(data as ContactRow) : null, error: null };
  },

  async update(client: DbClient, id: string, patch: Partial<Contact>): Promise<{ error: string | null }> {
    const { error } = await client.from("contacts").update(contactToDbUpdate(patch)).eq("id", id);
    return { error: error?.message ?? null };
  },

  async softArchive(client: DbClient, id: string): Promise<{ error: string | null }> {
    const { error } = await client.from("contacts").update({ archived: true }).eq("id", id);
    return { error: error?.message ?? null };
  },
};

export const viloRepo = {
  async listActive(client: DbClient): Promise<{ data: ViloOpportunity[]; error: string | null }> {
    const { data, error } = await client.from("v_vilo_active").select("*").order("next_followup_date", { ascending: true, nullsFirst: false });
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []).map((r) => viloRowToApp(r as ViloOpportunityRow)), error: null };
  },

  async insert(client: DbClient, o: Omit<ViloOpportunity, "id" | "createdAt" | "updatedAt">): Promise<{ data: ViloOpportunity | null; error: string | null }> {
    const row = viloToDbInsert(o);
    const { data, error } = await client.from("vilo_opportunities").insert(row).select("*").single();
    if (error) return { data: null, error: error.message };
    return { data: data ? viloRowToApp(data) : null, error: null };
  },

  async update(client: DbClient, id: string, patch: Partial<ViloOpportunity>): Promise<{ error: string | null }> {
    const { error } = await client.from("vilo_opportunities").update(viloToDbUpdate(patch)).eq("id", id);
    return { error: error?.message ?? null };
  },

  async softArchive(client: DbClient, id: string): Promise<{ error: string | null }> {
    const { error } = await client.from("vilo_opportunities").update({ archived: true }).eq("id", id);
    return { error: error?.message ?? null };
  },
};

export const vitalisRepo = {
  async listActive(client: DbClient): Promise<{ data: PatientLead[]; error: string | null }> {
    const { data, error } = await client.from("v_vitalis_active").select("*").order("created_at", { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []).map((r) => patientRowToApp(r as PatientLeadRow)), error: null };
  },

  async insert(client: DbClient, l: Omit<PatientLead, "id" | "createdAt" | "updatedAt">): Promise<{ data: PatientLead | null; error: string | null }> {
    const row = patientToDbInsert(l);
    const { data, error } = await client.from("patient_leads").insert(row).select("*").single();
    if (error) return { data: null, error: error.message };
    return { data: data ? patientRowToApp(data) : null, error: null };
  },

  async update(client: DbClient, id: string, patch: Partial<PatientLead>): Promise<{ error: string | null }> {
    const { error } = await client.from("patient_leads").update(patientToDbUpdate(patch)).eq("id", id);
    return { error: error?.message ?? null };
  },

  async softArchive(client: DbClient, id: string): Promise<{ error: string | null }> {
    const { error } = await client.from("patient_leads").update({ archived: true }).eq("id", id);
    return { error: error?.message ?? null };
  },
};

export const tasksRepo = {
  async listOpen(client: DbClient): Promise<{ data: TaskItem[]; error: string | null }> {
    const { data, error } = await client.from("tasks").select("*").eq("done", false).order("due_date");
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []).map((r) => taskRowToApp(r as TaskRow)), error: null };
  },

  async listAll(client: DbClient): Promise<{ data: TaskItem[]; error: string | null }> {
    const { data, error } = await client.from("tasks").select("*").order("due_date");
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []).map((r) => taskRowToApp(r as TaskRow)), error: null };
  },

  async insert(client: DbClient, t: Omit<TaskItem, "id" | "createdAt">): Promise<{ data: TaskItem | null; error: string | null }> {
    const row = taskToDbInsert(t);
    const { data, error } = await client.from("tasks").insert(row).select("*").single();
    if (error) return { data: null, error: error.message };
    return { data: data ? taskRowToApp(data) : null, error: null };
  },

  async update(client: DbClient, id: string, patch: Partial<TaskItem>): Promise<{ error: string | null }> {
    const { error } = await client.from("tasks").update(taskToDbUpdate(patch)).eq("id", id);
    return { error: error?.message ?? null };
  },

  /** Marks done — DB trigger sets done_at on transition to done=true */
  async setDone(client: DbClient, id: string, done: boolean): Promise<{ error: string | null }> {
    const { error } = await client.from("tasks").update({ done }).eq("id", id);
    return { error: error?.message ?? null };
  },

  async remove(client: DbClient, id: string): Promise<{ error: string | null }> {
    const { error } = await client.from("tasks").delete().eq("id", id);
    return { error: error?.message ?? null };
  },
};

export const dashboardRepo = {
  async metrics(client: DbClient): Promise<{ data: DashboardMetricsRow | null; error: string | null }> {
    const { data, error } = await client.from("v_dashboard_metrics").select("*").single();
    if (error) return { data: null, error: error.message };
    return { data: (data as DashboardMetricsRow | null) ?? null, error: null };
  },
};

/** Pull everything active (for a future one-shot sync into Zustand). */
export async function pullAllActive(client: DbClient): Promise<{
  organizations: Organization[];
  contacts: Contact[];
  vilo: ViloOpportunity[];
  leads: PatientLead[];
  tasks: TaskItem[];
  error: string | null;
}> {
  try {
    const [orgs, contacts, vilo, leads, tasks] = await Promise.all([
      organizationsRepo.listActive(client),
      contactsRepo.listAllActive(client),
      viloRepo.listActive(client),
      vitalisRepo.listActive(client),
      tasksRepo.listAll(client),
    ]);
    const firstErr = orgs.error ?? contacts.error ?? vilo.error ?? leads.error ?? tasks.error;
    if (firstErr) {
      return {
        organizations: [],
        contacts: [],
        vilo: [],
        leads: [],
        tasks: [],
        error: firstErr,
      };
    }
    return {
      organizations: orgs.data,
      contacts: contacts.data,
      vilo: vilo.data,
      leads: leads.data,
      tasks: tasks.data,
      error: null,
    };
  } catch (e) {
    return { organizations: [], contacts: [], vilo: [], leads: [], tasks: [], error: errMessage(e) };
  }
}
