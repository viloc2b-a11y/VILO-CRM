import { createClient } from "@/lib/supabase/client";
import type { InsertOrganization, Organization, UpdateOrganization } from "@/lib/supabase/types";

export async function getOrganizations(): Promise<Organization[]> {
  const sb = createClient();
  const { data, error } = await sb.from("organizations").select("*").eq("archived", false).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createOrganization(payload: InsertOrganization): Promise<Organization> {
  const sb = createClient();
  const { data, error } = await sb.from("organizations").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateOrganization({ id, ...payload }: UpdateOrganization): Promise<Organization> {
  const sb = createClient();
  const { data, error } = await sb.from("organizations").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function archiveOrganization(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("organizations").update({ archived: true }).eq("id", id);
  if (error) throw error;
}
