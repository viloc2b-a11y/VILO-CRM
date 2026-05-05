import { createServerSideClient } from "@/lib/supabase/server";
import type { LeadSource, OrgType } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tipos de org alineados a `org_type`; `Vendor` se guarda como `Other`. */
export type B2BLeadCompanyType = OrgType | "Vendor";

export type B2BLeadInput = {
  company_name: string;
  company_type: B2BLeadCompanyType;
  website?: string;
  /** Se vuelca en `organizations.notes` y/o `vilo_opportunities.therapeutic_area` (primer ítem o lista corta). */
  therapeutic_areas?: string[];
  contact_name: string;
  contact_title?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_linkedin?: string;
  /** conference | linkedin | referral | manual → `lead_source` */
  source?: string;
};

function mapOrgType(t: B2BLeadCompanyType): OrgType {
  return t === "Vendor" ? "Other" : t;
}

function mapLeadSource(s: string | undefined): LeadSource {
  const m: Record<string, LeadSource> = {
    conference: "Conference",
    linkedin: "LinkedIn",
    referral: "Referral",
    manual: "Other",
  };
  return m[(s ?? "").toLowerCase()] ?? "Other";
}

function normalizeWebsiteHost(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return t.replace(/^https?:\/\//i, "").split("/")[0]?.replace(/^www\./i, "") ?? null;
  }
}

function therapeuticAreaText(areas: string[] | undefined): string | null {
  if (!areas?.length) return null;
  const s = areas.map((a) => a.trim()).filter(Boolean).join("; ");
  return s.slice(0, 500) || null;
}

export type IngestB2BLeadResult = {
  organizationId: string;
  opportunityId: string;
  contactId: string;
  status: "ingested";
};

/**
 * Alta de lead B2B: org (dedupe), contacto, oportunidad Vilo en **Lead Identified** y **action_item** de primer toque.
 *
 * Usa sesión Supabase (RLS). Para webhooks sin usuario, pasá un cliente **service role** en `client`.
 */
export async function ingestB2BLead(
  lead: B2BLeadInput,
  client?: SupabaseClient,
): Promise<IngestB2BLeadResult> {
  const supabase = client ?? (await createServerSideClient());

  const name = lead.company_name?.trim();
  const contactName = lead.contact_name?.trim();
  if (!name || !contactName) {
    throw new Error("company_name and contact_name are required");
  }

  let organizationId: string | null = null;
  const host = lead.website ? normalizeWebsiteHost(lead.website) : null;

  if (host) {
    const { data: byWeb } = await supabase
      .from("organizations")
      .select("id")
      .not("website", "is", null)
      .ilike("website", `%${host}%`)
      .eq("archived", false)
      .limit(1)
      .maybeSingle();
    organizationId = byWeb?.id ?? null;
  }

  if (!organizationId) {
    const { data: byName } = await supabase
      .from("organizations")
      .select("id")
      .ilike("name", name)
      .eq("archived", false)
      .limit(1)
      .maybeSingle();
    organizationId = byName?.id ?? null;
  }

  const orgNotes = therapeuticAreaText(lead.therapeutic_areas)
    ? `Therapeutic areas (intake): ${therapeuticAreaText(lead.therapeutic_areas)}`
    : null;

  if (!organizationId) {
    const { data: newOrg, error: compErr } = await supabase
      .from("organizations")
      .insert({
        name,
        type: mapOrgType(lead.company_type),
        website: lead.website?.trim() || null,
        notes: orgNotes,
      })
      .select("id")
      .single();

    const newOrgId = newOrg?.id ?? null;
    if (compErr || !newOrgId) {
      throw new Error(compErr?.message ?? "Failed to create organization");
    }
    organizationId = newOrgId;
  }

  if (!organizationId) {
    throw new Error("Failed to resolve organization");
  }

  const contactNotes = [
    lead.contact_linkedin?.trim() ? `LinkedIn: ${lead.contact_linkedin.trim()}` : null,
    lead.source?.trim() ? `Intake source: ${lead.source.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { data: newContact, error: contactErr } = await supabase
    .from("contacts")
    .insert({
      org_id: organizationId,
      full_name: contactName,
      role: lead.contact_title?.trim() || null,
      email: lead.contact_email?.trim().toLowerCase() || null,
      phone: lead.contact_phone?.trim() || null,
      notes: contactNotes || null,
    })
    .select("id")
    .single();

  const contactId = newContact?.id ?? null;
  if (contactErr || !contactId) {
    throw new Error(contactErr?.message ?? "Failed to create contact");
  }

  const oppId = crypto.randomUUID();
  const firstArea = lead.therapeutic_areas?.map((a) => a.trim()).find(Boolean) ?? null;
  const close = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const closeDate = close.toISOString().slice(0, 10);

  const { error: oppErr } = await supabase.from("vilo_opportunities").insert({
    id: oppId,
    org_id: organizationId,
    contact_id: contactId,
    company_name: name,
    contact_name: contactName,
    role: lead.contact_title?.trim() || null,
    email: lead.contact_email?.trim().toLowerCase() || null,
    phone: lead.contact_phone?.trim() || null,
    therapeutic_area: firstArea,
    opportunity_type: null,
    source: mapLeadSource(lead.source),
    status: "Lead Identified",
    priority: "Medium",
    potential_value: null,
    notes: orgNotes,
    last_contact_date: null,
    next_followup_date: null,
    expected_close_date: closeDate,
    enrichment_status: "pending",
    archived: false,
  });

  if (oppErr) {
    throw new Error(oppErr.message);
  }

  const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: taskErr } = await supabase.from("action_items").insert({
    business_unit: "vilo_research",
    record_type: "opportunity",
    record_id: oppId,
    title: `Primer contacto: ${name}`,
    status: "pending",
    priority: "medium",
    next_action: "Enviar email de presentación y agendar llamada intro",
    due_date: due,
    value_usd: null,
    source: "b2b_intake_first_touch",
  });

  if (taskErr) {
    throw new Error(taskErr.message);
  }

  return {
    organizationId,
    opportunityId: oppId,
    contactId,
    status: "ingested",
  };
}
