import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactWithOrg, InsertContact } from "@/lib/supabase/types";
import { validateContact } from "@/lib/db/validators";

export async function getContacts(orgId?: string): Promise<ContactWithOrg[]> {
  const sb = createClient();
  let q = sb
    .from("contacts")
    .select("*, organization:organizations(id, name, type)")
    .eq("archived", false)
    .order("full_name");
  if (orgId) q = q.eq("org_id", orgId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ContactWithOrg[];
}

export async function createContact(payload: InsertContact): Promise<Contact> {
  validateContact(payload);
  const sb = createClient();
  const { data, error } = await sb.from("contacts").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function archiveContact(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("contacts").update({ archived: true }).eq("id", id);
  if (error) throw error;
}
