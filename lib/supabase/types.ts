// ============================================================
//  VILO CRM — TypeScript Types
//  Mirrors the Supabase PostgreSQL schema exactly.
//  Use these across your Next.js app and API routes.
// ============================================================

/** JSON column / RPC shapes — useful with `supabase gen types` workflows. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ── ENUMS ────────────────────────────────────────────────────

export type OrgType = "CRO" | "Sponsor" | "Lab" | "Biobank" | "Partner" | "Other";

export type PriorityLevel = "High" | "Medium" | "Low";

export type ViloStage =
  | "Lead Identified"
  | "Outreach Sent"
  | "Response Received"
  | "Intro Call Pending"
  | "Feasibility Sent"
  | "Negotiation"
  | "Activated"
  | "Closed Lost"
  | "Nurture";

export type OpportunityType =
  | "Phase I"
  | "Phase II"
  | "Phase III"
  | "Phase IV"
  | "Observational"
  | "Registry"
  | "Lab/Biobank";

export type LeadSource =
  | "LinkedIn"
  | "Apollo"
  | "ClinicalTrials.gov"
  | "Conference"
  | "Referral"
  | "Cold Email"
  | "Other";

export type VitalisStage =
  | "New Lead"
  | "Contact Attempted"
  | "Responded"
  | "Prescreen Started"
  | "Prequalified"
  | "Scheduled"
  | "No-show"
  | "Enrolled"
  | "Screen Fail"
  | "Nurture / Future Study";

export type PreferredLanguage = "Spanish" | "English" | "Bilingual";

export type ContactChannel = "WhatsApp" | "Phone" | "SMS" | "Email";

export type GenderValue = "Female" | "Male" | "Non-binary" | "Prefer not to say";

export type AgeRangeValue = "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+";

export type TaskChannel = "vilo" | "vitalis";

export type PreferredContactMethod = "Email" | "Phone" | "LinkedIn" | "WhatsApp";

// ── TABLE TYPES ───────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  website: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  org_id: string | null;
  full_name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  preferred_contact: PreferredContactMethod;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ViloOpportunity {
  id: string;
  org_id: string | null;
  contact_id: string | null;

  // Denormalized — fast entry, no join needed
  company_name: string;
  contact_name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;

  therapeutic_area: string | null;
  opportunity_type: OpportunityType | null;
  source: LeadSource | null;
  status: ViloStage;
  priority: PriorityLevel;
  potential_value: number | null;
  notes: string | null;

  last_contact_date: string | null;
  next_followup_date: string | null;

  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientLead {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;

  preferred_language: PreferredLanguage;
  age_range: AgeRangeValue | null;
  gender: GenderValue | null;

  condition_or_study_interest: string | null;
  source_campaign: string | null;
  zip_code: string | null;
  preferred_contact_channel: ContactChannel;

  current_stage: VitalisStage;
  next_action: string | null;
  screen_fail_reason: string | null;

  last_contact_date: string | null;
  notes: string | null;

  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  channel: TaskChannel;
  priority: PriorityLevel;
  due_date: string;
  done: boolean;
  done_at: string | null;

  linked_vilo_id: string | null;
  linked_vitalis_id: string | null;

  created_at: string;
  updated_at: string;
}

// ── INSERT TYPES (omit server-generated fields) ───────────────

export type InsertOrganization = Omit<Organization, "id" | "created_at" | "updated_at">;
export type InsertContact = Omit<Contact, "id" | "created_at" | "updated_at">;
export type InsertViloOpportunity = Omit<ViloOpportunity, "id" | "created_at" | "updated_at">;
export type InsertPatientLead = Omit<PatientLead, "id" | "created_at" | "updated_at">;
export type InsertTask = Omit<Task, "id" | "created_at" | "updated_at" | "done_at">;

// ── UPDATE TYPES (all fields optional except id) ──────────────

export type UpdateOrganization = Partial<InsertOrganization> & { id: string };
export type UpdateContact = Partial<InsertContact> & { id: string };
export type UpdateViloOpportunity = Partial<InsertViloOpportunity> & { id: string };
export type UpdatePatientLead = Partial<InsertPatientLead> & { id: string };
export type UpdateTask = Partial<InsertTask> & { id: string };

// ── JOIN TYPES (common query shapes) ─────────────────────────

/** Contact with its organization resolved */
export interface ContactWithOrg extends Contact {
  organization: Organization | null;
}

/** Opportunity with linked contact and org resolved */
export interface OpportunityWithRefs extends ViloOpportunity {
  organization: Organization | null;
  contact: Contact | null;
}

/** Task with linked record resolved (only one will be present) */
export interface TaskWithRef extends Task {
  vilo_opportunity: Pick<ViloOpportunity, "id" | "company_name" | "status"> | null;
  patient_lead: Pick<PatientLead, "id" | "full_name" | "current_stage"> | null;
}

// ── DASHBOARD METRIC TYPE ─────────────────────────────────────

export interface DashboardMetrics {
  vilo_active_count: number;
  vilo_feasibility_count: number;
  vilo_won_count: number;
  vilo_overdue_count: number;
  vitalis_new_today: number;
  vitalis_prescreens: number;
  vitalis_scheduled: number;
  vitalis_enrolled: number;
  tasks_pending: number;
  tasks_overdue: number;
}

// ── SUPABASE DATABASE TYPE (for createClient<Database> after `supabase gen types`) ─

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: InsertOrganization;
        Update: Partial<InsertOrganization>;
        Relationships: [];
      };
      contacts: {
        Row: Contact;
        Insert: InsertContact;
        Update: Partial<InsertContact>;
        Relationships: [];
      };
      vilo_opportunities: {
        Row: ViloOpportunity;
        Insert: InsertViloOpportunity;
        Update: Partial<InsertViloOpportunity>;
        Relationships: [];
      };
      patient_leads: {
        Row: PatientLead;
        Insert: InsertPatientLead;
        Update: Partial<InsertPatientLead>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: InsertTask;
        Update: Partial<InsertTask>;
        Relationships: [];
      };
    };
    Views: {
      v_vilo_active: { Row: ViloOpportunity; Relationships: [] };
      v_vilo_overdue: {
        Row: Pick<ViloOpportunity, "id" | "company_name" | "contact_name" | "status" | "priority" | "next_followup_date">;
        Relationships: [];
      };
      v_vitalis_active: { Row: PatientLead; Relationships: [] };
      v_tasks_overdue: { Row: Task; Relationships: [] };
      v_dashboard_metrics: { Row: DashboardMetrics; Relationships: [] };
    };
    Functions: {
      [_ in never]: never;
    };
  };
}

/** Postgres enums (mirrors SQL); kept separate from `Database` for `GenericSchema` compatibility. */
export type DbEnums = {
  org_type: OrgType;
  priority_level: PriorityLevel;
  vilo_stage: ViloStage;
  opportunity_type: OpportunityType;
  lead_source: LeadSource;
  vitalis_stage: VitalisStage;
  preferred_language: PreferredLanguage;
  contact_channel: ContactChannel;
  gender_value: GenderValue;
  age_range_value: AgeRangeValue;
  task_channel: TaskChannel;
  preferred_contact_method: PreferredContactMethod;
};

// ── Aliases: DB row names vs app UI models in `lib/types.ts` ──

export type OrganizationRow = Organization;
export type ContactRow = Contact;
export type ViloOpportunityRow = ViloOpportunity;
export type PatientLeadRow = PatientLead;
export type TaskRow = Task;
export type DashboardMetricsRow = DashboardMetrics;

export type OrganizationInsert = InsertOrganization;
export type ContactInsert = InsertContact;
export type ViloOpportunityInsert = InsertViloOpportunity;
export type PatientLeadInsert = InsertPatientLead;
export type TaskInsert = InsertTask;

export type OrganizationUpdate = Partial<InsertOrganization>;
export type ContactUpdate = Partial<InsertContact>;
export type ViloOpportunityUpdate = Partial<InsertViloOpportunity>;
export type PatientLeadUpdate = Partial<InsertPatientLead>;
export type TaskUpdate = Partial<InsertTask>;

/** @deprecated Prefer `ContactWithOrg` */
export type ContactWithOrganization = ContactWithOrg;
/** @deprecated Prefer `OpportunityWithRefs` */
export type ViloOpportunityWithRelations = OpportunityWithRefs;
