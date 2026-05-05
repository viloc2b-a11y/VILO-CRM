// ============================================================
//  VILO CRM — TypeScript Types
//  Mirrors the Supabase PostgreSQL schema exactly.
//  Use these across your Next.js app and API routes.
// ============================================================

/** JSON column / RPC shapes — useful with `supabase gen types` workflows. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ── ENUMS ────────────────────────────────────────────────────

export type OrgType = "CRO" | "Sponsor" | "Lab" | "Biobank" | "Partner" | "Other";

export type PriorityLevel = "Critical" | "High" | "Medium" | "Low";

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
  | "Visit Confirmed"
  | "No-show"
  | "Enrolled"
  | "Screen Fail"
  | "Patient Lost"
  | "Nurture / Future Study";

export type PreferredLanguage = "Spanish" | "English" | "Bilingual";

export type ContactChannel = "WhatsApp" | "Phone" | "SMS" | "Email";

export type GenderValue = "Female" | "Male" | "Non-binary" | "Prefer not to say";

export type AgeRangeValue = "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+";

export type TaskChannel = "vilo" | "vitalis";

export type PreferredContactMethod = "Email" | "Phone" | "LinkedIn" | "WhatsApp";

/** B2B outreach / enrichment (`38_vilo_b2b_forecast.sql`). */
export type B2bLastInteractionType = "email" | "call" | "linkedin" | "meeting" | "proposal" | "none";

export type B2bEnrichmentStatus = "pending" | "processing" | "completed" | "failed";

/** Business unit — RLS + action_items (see supabase/06_*.sql) */
export type BuEnum = "vilo_research" | "vitalis" | "hazloasiya";

export type ActionItemPriority = "low" | "medium" | "high" | "critical";

export type ActionItemStatus = "pending" | "in_progress" | "completed" | "canceled";

export type ActionItemRecord =
  | "opportunity"
  | "patient"
  | "user"
  | "submission"
  | "company"
  | "contact"
  | "campaign"
  | "study"
  | "study_site"
  | "monitoring_visit"
  | "protocol_deviation"
  | "study_payment";

export type StudyLifecycle = "planning" | "active" | "paused" | "closed";

export type SiteActivation = "not_started" | "initiating" | "active" | "closed";

export type MonitoringVisitStatus = "scheduled" | "completed" | "cancelled";

export type ProtocolDeviationStatus = "open" | "under_review" | "closed";

export type StudyPaymentStatus = "planned" | "invoiced" | "paid" | "void";

export type PatientVisitStatus = "scheduled" | "completed" | "no_show" | "canceled";

export type SpecimenStatus =
  | "planned"
  | "collected"
  | "processed"
  | "stored"
  | "shipped"
  | "received"
  | "lost"
  | "destroyed";

export type ShipmentStatus = "draft" | "ready" | "in_transit" | "delivered" | "exception" | "canceled";

export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "void";

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
  /** Fecha objetivo de cierre — ver `23_orchestrator_agent.sql`. */
  expected_close_date: string | null;

  /** Storage bucket `proposals` — ver `16_proposal_agent.sql` / Edge `proposal-agent`. */
  proposal_pdf_path: string | null;
  proposal_pdf_generated_at: string | null;

  study_id: string | null;

  /** Opcional — ROI campañas (`32_campaign_roi_metrics.sql`). */
  marketing_campaign_id: string | null;

  /** B2B — `38_vilo_b2b_forecast.sql`. */
  decision_maker_role: string | null;
  last_interaction_type: B2bLastInteractionType | null;
  next_follow_up: string | null;
  relationship_strength: number | null;
  enrichment_status: B2bEnrichmentStatus;

  archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Vista `v_vilo_pipeline_forecast` — forecast por etapa con peso implícito. */
export interface VViloPipelineForecastRow {
  stage: ViloStage;
  opp_count: number;
  total_value: number;
  weighted_value: number;
  stale_count: number;
  avg_stage_weight_pct: number;
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
  /** Columnas de reporting; también suele haber UTM en intake_attribution (ver `40_vitalis_b2c_consent_funnel.sql`). */
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  zip_code: string | null;
  preferred_contact_channel: ContactChannel;

  current_stage: VitalisStage;
  next_action: string | null;
  screen_fail_reason: string | null;

  last_contact_date: string | null;
  notes: string | null;

  consent_to_contact: boolean;
  /** Por canal: sms, whatsapp, email, data — ver migración Vitalis B2C. */
  consent_flags: Json;
  /** Último canal efectivo: sms | whatsapp | email | call | none */
  last_contact_channel: string | null;
  navigator_notes: string | null;
  assigned_navigator: string | null;
  intake_attribution: Json;
  last_intake_at: string | null;

  /** Generadas en BD — dedup intake (ver `17_vitalis_intake.sql`). */
  phone_normalized: string;
  email_normalized: string | null;

  prescreen_template_id: string | null;
  prescreen_score: number | null;
  prescreen_exclusions: Json | null;
  prescreen_invited_at: string | null;
  prescreen_completed_at: string | null;

  study_id: string | null;

  scheduled_visit_at: string | null;
  visit_site_address: string | null;
  visit_completed_at: string | null;
  scheduler_state: Json;

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

export interface Study {
  id: string;
  name: string;
  protocol_identifier: string | null;
  sponsor_display_name: string | null;
  status: StudyLifecycle;
  external_system: string | null;
  external_id: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudySite {
  id: string;
  study_id: string;
  name: string;
  site_number: string | null;
  activation_status: SiteActivation;
  activated_at: string | null;
  external_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyMonitoringVisit {
  id: string;
  study_site_id: string;
  visit_type: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: MonitoringVisitStatus;
  findings: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProtocolDeviation {
  id: string;
  study_id: string;
  study_site_id: string | null;
  summary: string;
  detail: string | null;
  status: ProtocolDeviationStatus;
  capa_notes: string | null;
  detected_at: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyPayment {
  id: string;
  study_id: string;
  study_site_id: string | null;
  description: string;
  milestone_label: string | null;
  amount_usd: number;
  due_date: string | null;
  paid_at: string | null;
  status: StudyPaymentStatus;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientVisit {
  id: string;
  study_id: string | null;
  patient_lead_id: string | null;
  visit_name: string;
  scheduled_at: string | null;
  completed_at: string | null;
  status: PatientVisitStatus;
  expected_revenue_usd: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Specimen {
  id: string;
  study_id: string | null;
  patient_visit_id: string | null;
  patient_lead_id: string | null;
  accession_number: string | null;
  specimen_type: string;
  collected_at: string | null;
  processed_at: string | null;
  status: SpecimenStatus;
  current_location: string | null;
  chain_of_custody: Json;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Shipment {
  id: string;
  study_id: string | null;
  courier: string | null;
  tracking_number: string | null;
  destination_name: string | null;
  destination_address: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  status: ShipmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentSpecimen {
  shipment_id: string;
  specimen_id: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  study_id: string | null;
  organization_id: string | null;
  invoice_number: string | null;
  status: InvoiceStatus;
  amount_usd: number;
  pass_through_costs_usd: number;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VRevenueLeakageRow {
  id: string;
  study_id: string | null;
  organization_id: string | null;
  invoice_number: string | null;
  status: InvoiceStatus;
  amount_usd: number;
  pass_through_costs_usd: number;
  gross_margin_usd: number;
  due_date: string | null;
  is_overdue: boolean;
}

export interface ActionItem {
  id: string;
  business_unit: BuEnum;
  record_type: ActionItemRecord;
  record_id: string;
  title: string;
  status: ActionItemStatus;
  next_action: string | null;
  due_date: string | null;
  owner_id: string | null;
  /** Delegado — ver supabase/12_action_items_assigned_to_rls.sql */
  assigned_to: string | null;
  priority: ActionItemPriority;
  value_usd: number | null;
  notes: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

/** HazloAsíYa — `public.submissions` (ver supabase/20_hazlo_submissions_validator.sql). */
export interface Submission {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  funnel_type: string;
  /** Opcional — mismo texto que `marketing_campaigns.name` (`32_campaign_roi_metrics.sql`). */
  source_campaign: string | null;
  /** Opcional — par con utm_campaign si la campaña en BD usa modo UTM (`33_campaign_roi_utm_join.sql`). */
  utm_source: string | null;
  utm_campaign: string | null;
  completion_status: string;
  payment_status: string | null;
  residence_address: string | null;
  document_paths: Json;
  validation_report: Json | null;
  validation_ran_at: string | null;
  /** 0–1; ver `31_hazlo_validator_sql_support.sql` + `lib/hazlo/validator/run.ts`. */
  validation_confidence: number | null;
  validation_errors: string[] | null;
  /** Resumen por doc_key; default `{}` en DB. */
  extracted_data: Json;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_last_error_code: string | null;
  stripe_last_error_message: string | null;
  square_payment_id: string | null;
  square_customer_id: string | null;
  square_last_error_code: string | null;
  square_last_error_message: string | null;
  square_location_id: string | null;
  payment_link_sent_at: string | null;
  needs_manual_review: boolean;
  payment_failed_at: string | null;
  payment_recovery_state: Json;
  pdf_delivered_at: string | null;
  user_birth_year: number | null;
  mailing_state: string | null;
  growth_channel_stats: Json;
  growth_state: Json;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Dedup de webhooks (`supabase/26_webhook_events.sql`). */
export type WebhookEventSource = "meta" | "stripe" | "square";
export type WebhookEventStatus = "success" | "ignored" | "failed" | "skipped";

export interface WebhookEvent {
  id: string;
  source: WebhookEventSource;
  processed_at: string;
  status: WebhookEventStatus;
  payload_preview: string | null;
}

/** Inbound WhatsApp (Meta) — `34_whatsapp_inbound_messages.sql`. */
export type WhatsAppInboundMessageType =
  | "text"
  | "image"
  | "audio"
  | "document"
  | "button"
  | "quick_reply";
export type WhatsAppInboundProcessedStatus = "pending" | "processed" | "ignored" | "failed";

export interface WhatsAppInboundMessage {
  id: string;
  wa_message_id: string;
  wa_phone_number: string;
  message_body: string | null;
  message_type: WhatsAppInboundMessageType;
  related_submission_id: string | null;
  related_patient_lead_id: string | null;
  intent_detected: string | null;
  processed_status: WhatsAppInboundProcessedStatus;
  processed_at: string | null;
  created_at: string;
}

/** Paid campaigns — CPL alert Orchestrator (`23_orchestrator_agent.sql`). */
export interface MarketingCampaign {
  id: string;
  name: string;
  cost_per_lead: number | null;
  /** Gasto total atribuible; si NULL la vista ROI puede estimar CPL × leads Vitalis. */
  lifetime_spend: number | null;
  /** Si ambos UTM están definidos, la vista ROI atribuye por par UTM (`33_campaign_roi_utm_join.sql`). */
  utm_source: string | null;
  utm_campaign: string | null;
  platform: string | null;
  external_id: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Key-value settings for Orchestrator thresholds. */
export interface OrchestratorSetting {
  key: string;
  value_numeric: number | null;
  value_text: string | null;
  updated_at: string;
}

/** Estado del cron Triage Agent (`24_triage_agent.sql`). */
export interface TriageAgentState {
  id: string;
  last_triage_at: string;
  last_critical_backlog_alert_at: string | null;
}

/** Toggle de agentes (`25_agent_control.sql`). */
export interface AgentAutomationSetting {
  agent_key: string;
  label: string;
  enabled: boolean;
  updated_at: string;
}

export type AgentExecutionStatus = "success" | "retry" | "failed";

export interface AgentExecutionLog {
  id: string;
  agent_name: string;
  trigger_event: string;
  input_data: Json | null;
  output_data: Json | null;
  status: AgentExecutionStatus;
  execution_time_ms: number;
  error_message: string | null;
  created_at: string;
}

export interface RecordAutomationOverride {
  id: string;
  table_name: string;
  record_id: string;
  paused: boolean;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

// ── INSERT TYPES (omit server-generated fields) ───────────────

export type InsertOrganization = Omit<Organization, "id" | "created_at" | "updated_at">;
export type InsertContact = Omit<Contact, "id" | "created_at" | "updated_at">;
export type InsertViloOpportunity = Omit<
  ViloOpportunity,
  | "id"
  | "created_at"
  | "updated_at"
  | "proposal_pdf_path"
  | "proposal_pdf_generated_at"
  | "decision_maker_role"
  | "last_interaction_type"
  | "next_follow_up"
  | "relationship_strength"
  | "enrichment_status"
> &
  Partial<
    Pick<
      ViloOpportunity,
      | "proposal_pdf_path"
      | "proposal_pdf_generated_at"
      | "decision_maker_role"
      | "last_interaction_type"
      | "next_follow_up"
      | "relationship_strength"
      | "enrichment_status"
    >
  >;
export type InsertPatientLead = Omit<
  PatientLead,
  "id" | "created_at" | "updated_at" | "phone_normalized" | "email_normalized"
> &
  Partial<
    Pick<
      PatientLead,
      | "consent_to_contact"
      | "consent_flags"
      | "utm_source"
      | "utm_campaign"
      | "utm_medium"
      | "last_contact_channel"
      | "navigator_notes"
      | "assigned_navigator"
      | "intake_attribution"
      | "last_intake_at"
      | "prescreen_template_id"
      | "prescreen_score"
      | "prescreen_exclusions"
      | "prescreen_invited_at"
      | "prescreen_completed_at"
      | "scheduled_visit_at"
      | "visit_site_address"
      | "visit_completed_at"
      | "scheduler_state"
    >
  >;
export type InsertTask = Omit<Task, "id" | "created_at" | "updated_at" | "done_at">;
export type InsertStudy = Omit<Study, "id" | "created_at" | "updated_at">;
export type InsertStudySite = Omit<StudySite, "id" | "created_at" | "updated_at">;
export type InsertStudyMonitoringVisit = Omit<StudyMonitoringVisit, "id" | "created_at" | "updated_at">;
export type InsertProtocolDeviation = Omit<ProtocolDeviation, "id" | "created_at" | "updated_at">;
export type InsertStudyPayment = Omit<StudyPayment, "id" | "created_at" | "updated_at">;
export type InsertPatientVisit = Omit<PatientVisit, "id" | "created_at" | "updated_at">;
export type InsertSpecimen = Omit<Specimen, "id" | "created_at" | "updated_at">;
export type InsertShipment = Omit<Shipment, "id" | "created_at" | "updated_at">;
export type InsertShipmentSpecimen = Omit<ShipmentSpecimen, "created_at"> &
  Partial<Pick<ShipmentSpecimen, "created_at">>;
export type InsertInvoice = Omit<Invoice, "id" | "created_at" | "updated_at">;
export type InsertActionItem = Omit<ActionItem, "id" | "created_at" | "updated_at">;
export type InsertSubmission = Omit<Submission, "id" | "created_at" | "updated_at"> &
  Partial<
    Pick<
      Submission,
      | "validation_report"
      | "validation_ran_at"
      | "validation_confidence"
      | "validation_errors"
      | "extracted_data"
      | "stripe_customer_id"
      | "stripe_payment_intent_id"
      | "stripe_last_error_code"
      | "stripe_last_error_message"
      | "square_payment_id"
      | "square_customer_id"
      | "square_last_error_code"
      | "square_last_error_message"
      | "square_location_id"
      | "payment_link_sent_at"
      | "needs_manual_review"
      | "payment_failed_at"
      | "payment_recovery_state"
      | "pdf_delivered_at"
      | "user_birth_year"
      | "mailing_state"
      | "growth_channel_stats"
      | "growth_state"
      | "source_campaign"
      | "utm_source"
      | "utm_campaign"
    >
  >;

export type InsertMarketingCampaign = Omit<MarketingCampaign, "id" | "created_at" | "updated_at"> &
  Partial<Pick<MarketingCampaign, "archived">>;

export type InsertOrchestratorSetting = Pick<OrchestratorSetting, "key"> &
  Partial<Pick<OrchestratorSetting, "value_numeric" | "value_text" | "updated_at">>;

export type InsertTriageAgentState = Pick<TriageAgentState, "id"> &
  Partial<Pick<TriageAgentState, "last_triage_at" | "last_critical_backlog_alert_at">>;

export type InsertAgentExecutionLog = Omit<AgentExecutionLog, "id" | "created_at"> &
  Partial<Pick<AgentExecutionLog, "created_at">>;

export type InsertRecordAutomationOverride = Omit<RecordAutomationOverride, "id" | "created_at" | "updated_at"> &
  Partial<Pick<RecordAutomationOverride, "created_at" | "updated_at">>;

// ── UPDATE TYPES (all fields optional except id) ──────────────

export type UpdateOrganization = Partial<InsertOrganization> & { id: string };
export type UpdateContact = Partial<InsertContact> & { id: string };
export type UpdateViloOpportunity = Partial<InsertViloOpportunity> & { id: string };
export type UpdatePatientLead = Partial<InsertPatientLead> & { id: string };
export type UpdateTask = Partial<InsertTask> & { id: string };
export type UpdateStudy = Partial<InsertStudy> & { id: string };
export type UpdateStudySite = Partial<InsertStudySite> & { id: string };
export type UpdateStudyMonitoringVisit = Partial<InsertStudyMonitoringVisit> & { id: string };
export type UpdateProtocolDeviation = Partial<InsertProtocolDeviation> & { id: string };
export type UpdateStudyPayment = Partial<InsertStudyPayment> & { id: string };
export type UpdatePatientVisit = Partial<InsertPatientVisit> & { id: string };
export type UpdateSpecimen = Partial<InsertSpecimen> & { id: string };
export type UpdateShipment = Partial<InsertShipment> & { id: string };
export type UpdateInvoice = Partial<InsertInvoice> & { id: string };
export type UpdateActionItem = Partial<InsertActionItem> & { id: string };
export type UpdateSubmission = Partial<InsertSubmission> & { id: string };
export type UpdateMarketingCampaign = Partial<InsertMarketingCampaign> & { id: string };
export type UpdateOrchestratorSetting = Partial<Omit<OrchestratorSetting, "key">> & { key: string };

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

/** `v_action_center_metrics` — RLS-scoped aggregates */
export interface ActionCenterMetrics {
  critical: number;
  pipeline_value: number;
}

/** `v_hazlo_metrics` — KPIs Hazlo 30d (`supabase/30_hazlo_square_extras_and_metrics.sql`). */
export interface VHazloMetricsRow {
  submissions_30d: number;
  funnels_completed: number;
  paid_count: number;
  revenue_usd_estimate: number;
  pending_reviews: number;
  missing_documents: number;
  upsell_candidates_pdf_delivered: number;
  conversion_rate_pct_paid_over_all_30d: number | null;
}

/** `v_campaign_roi_metrics` (`32_campaign_roi_metrics.sql`). */
export interface VCampaignRoiMetricsRow {
  campaign_id: string;
  campaign_name: string;
  platform: string | null;
  external_ref: string | null;
  cost_per_lead_config: number | null;
  lifetime_spend: number | null;
  leads: number;
  qualified: number;
  conversions: number;
  hazlo_submissions: number;
  hazlo_paid: number;
  hazlo_revenue: number;
  vilo_pipeline: number;
  total_revenue: number;
  total_spend: number;
  cost_per_lead: number;
  cac: number;
  roi_percent: number;
}

/** `v_hazlo_review_queue` (`31_hazlo_validator_sql_support.sql`). */
export interface VHazloReviewQueueRow {
  id: string;
  funnel_type: string;
  completion_status: string;
  validation_confidence: number | null;
  validation_errors: string[] | null;
  validation_report: Json | null;
  validation_ran_at: string | null;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  document_key_count: number;
}

/** `v_action_metrics` — una fila por métrica (pipeline, overdue, tareas por BU) */
export interface VActionMetricsRow {
  metric: string;
  value: number;
  status: string;
}

/** Retorno de `team_members_for_my_business_units()` (ver supabase/13_team_members_rpc.sql) */
export interface TeamMemberRpcRow {
  id: string;
  full_name: string;
  email: string | null;
}

/** Auth extension: `public.user_profiles` */
export interface UserProfileTable {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  allowed_business_units: BuEnum[];
  created_at: string;
  updated_at: string;
}

/** Audit trail */
export interface ActivityLogTable {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Json | null;
  created_at: string;
}

/** Dedupe keys for `sendUnifiedAlert` (migration `36_notification_deliveries.sql`). */
export interface NotificationDelivery {
  id: string;
  idempotency_key: string;
  created_at: string;
}

/** Audit log for alerts (`37_notifications_log.sql`). */
export interface NotificationLog {
  id: string;
  channel: "email" | "slack" | "both";
  recipient: string | null;
  subject: string | null;
  template_key: "critical_task_overdue" | "report_generated" | "payment_recovery_failed";
  status: "queued" | "sent" | "failed";
  payload: Json;
  created_at: string;
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
      studies: {
        Row: Study;
        Insert: InsertStudy;
        Update: Partial<InsertStudy>;
        Relationships: [];
      };
      study_sites: {
        Row: StudySite;
        Insert: InsertStudySite;
        Update: Partial<InsertStudySite>;
        Relationships: [];
      };
      study_monitoring_visits: {
        Row: StudyMonitoringVisit;
        Insert: InsertStudyMonitoringVisit;
        Update: Partial<InsertStudyMonitoringVisit>;
        Relationships: [];
      };
      protocol_deviations: {
        Row: ProtocolDeviation;
        Insert: InsertProtocolDeviation;
        Update: Partial<InsertProtocolDeviation>;
        Relationships: [];
      };
      study_payments: {
        Row: StudyPayment;
        Insert: InsertStudyPayment;
        Update: Partial<InsertStudyPayment>;
        Relationships: [];
      };
      patient_visits: {
        Row: PatientVisit;
        Insert: InsertPatientVisit;
        Update: Partial<InsertPatientVisit>;
        Relationships: [];
      };
      specimens: {
        Row: Specimen;
        Insert: InsertSpecimen;
        Update: Partial<InsertSpecimen>;
        Relationships: [];
      };
      shipments: {
        Row: Shipment;
        Insert: InsertShipment;
        Update: Partial<InsertShipment>;
        Relationships: [];
      };
      shipment_specimens: {
        Row: ShipmentSpecimen;
        Insert: InsertShipmentSpecimen;
        Update: Partial<InsertShipmentSpecimen>;
        Relationships: [];
      };
      invoices: {
        Row: Invoice;
        Insert: InsertInvoice;
        Update: Partial<InsertInvoice>;
        Relationships: [];
      };
      action_items: {
        Row: ActionItem;
        Insert: InsertActionItem;
        Update: Partial<InsertActionItem>;
        Relationships: [];
      };
      submissions: {
        Row: Submission;
        Insert: InsertSubmission;
        Update: Partial<InsertSubmission>;
        Relationships: [];
      };
      webhook_events: {
        Row: WebhookEvent;
        Insert: Pick<WebhookEvent, "id" | "source" | "status"> &
          Partial<Pick<WebhookEvent, "processed_at" | "payload_preview">>;
        Update: Partial<Pick<WebhookEvent, "status" | "processed_at" | "payload_preview">>;
        Relationships: [];
      };
      whatsapp_inbound_messages: {
        Row: WhatsAppInboundMessage;
        Insert: Omit<WhatsAppInboundMessage, "id" | "created_at"> &
          Partial<Pick<WhatsAppInboundMessage, "id" | "created_at">>;
        Update: Partial<
          Omit<WhatsAppInboundMessage, "id" | "wa_message_id" | "created_at">
        >;
        Relationships: [];
      };
      marketing_campaigns: {
        Row: MarketingCampaign;
        Insert: InsertMarketingCampaign;
        Update: Partial<InsertMarketingCampaign>;
        Relationships: [];
      };
      orchestrator_settings: {
        Row: OrchestratorSetting;
        Insert: InsertOrchestratorSetting;
        Update: Partial<InsertOrchestratorSetting>;
        Relationships: [];
      };
      triage_agent_state: {
        Row: TriageAgentState;
        Insert: InsertTriageAgentState;
        Update: Partial<Pick<TriageAgentState, "last_triage_at" | "last_critical_backlog_alert_at">>;
        Relationships: [];
      };
      agent_automation_settings: {
        Row: AgentAutomationSetting;
        Insert: Omit<AgentAutomationSetting, "updated_at"> & Partial<Pick<AgentAutomationSetting, "updated_at">>;
        Update: Partial<Pick<AgentAutomationSetting, "label" | "enabled" | "updated_at">>;
        Relationships: [];
      };
      agent_execution_logs: {
        Row: AgentExecutionLog;
        Insert: InsertAgentExecutionLog;
        Update: never;
        Relationships: [];
      };
      record_automation_overrides: {
        Row: RecordAutomationOverride;
        Insert: InsertRecordAutomationOverride;
        Update: Partial<Omit<RecordAutomationOverride, "id">>;
        Relationships: [];
      };
      user_profiles: {
        Row: UserProfileTable;
        Insert: Omit<UserProfileTable, "created_at" | "updated_at" | "allowed_business_units"> &
          Partial<Pick<UserProfileTable, "created_at" | "updated_at" | "allowed_business_units">>;
        Update: Partial<Omit<UserProfileTable, "id">>;
        Relationships: [];
      };
      activity_log: {
        Row: ActivityLogTable;
        Insert: Omit<ActivityLogTable, "id" | "created_at"> & Partial<Pick<ActivityLogTable, "id" | "created_at">>;
        Update: Partial<Omit<ActivityLogTable, "id" | "created_at">>;
        Relationships: [];
      };
      notification_deliveries: {
        Row: NotificationDelivery;
        Insert: Pick<NotificationDelivery, "idempotency_key">;
        Update: never;
        Relationships: [];
      };
      notifications_log: {
        Row: NotificationLog;
        Insert: Pick<NotificationLog, "template_key"> &
          Partial<
            Pick<NotificationLog, "channel" | "recipient" | "subject" | "status" | "payload">
          >;
        Update: Partial<Pick<NotificationLog, "status" | "payload">>;
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
      v_action_center: { Row: ActionItem; Relationships: [] };
      v_action_center_metrics: { Row: ActionCenterMetrics; Relationships: [] };
      v_action_metrics: { Row: VActionMetricsRow; Relationships: [] };
      v_hazlo_metrics: { Row: VHazloMetricsRow; Relationships: [] };
      v_hazlo_review_queue: { Row: VHazloReviewQueueRow; Relationships: [] };
      v_campaign_roi_metrics: { Row: VCampaignRoiMetricsRow; Relationships: [] };
      v_vilo_pipeline_forecast: { Row: VViloPipelineForecastRow; Relationships: [] };
      v_revenue_leakage: { Row: VRevenueLeakageRow; Relationships: [] };
    };
    Functions: {
      team_members_for_my_business_units: {
        Args: Record<string, never>;
        Returns: TeamMemberRpcRow[];
      };
      orchestrator_owners_over_task_limit: {
        Args: { p_limit?: number };
        Returns: { owner_id: string; open_count: number }[];
      };
      register_webhook_event: {
        Args: { p_id: string; p_source: string; p_status: string; p_payload: Json };
        Returns: undefined;
      };
      mark_submission_reviewed: {
        Args: { p_submission_id: string; p_approved: boolean; p_notes?: string | null };
        Returns: undefined;
      };
      calculate_relationship_strength: {
        Args: { p_org_id: string };
        Returns: number;
      };
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
  bu_enum: BuEnum;
  action_item_priority_enum: ActionItemPriority;
  action_item_status_enum: ActionItemStatus;
  action_item_record_enum: ActionItemRecord;
  study_lifecycle_enum: StudyLifecycle;
  site_activation_enum: SiteActivation;
  monitoring_visit_status_enum: MonitoringVisitStatus;
  protocol_deviation_status_enum: ProtocolDeviationStatus;
  study_payment_status_enum: StudyPaymentStatus;
  patient_visit_status: PatientVisitStatus;
  specimen_status: SpecimenStatus;
  shipment_status: ShipmentStatus;
  invoice_status: InvoiceStatus;
};

// ── Aliases: DB row names vs app UI models in `lib/types.ts` ──

export type OrganizationRow = Organization;
export type ContactRow = Contact;
export type ViloOpportunityRow = ViloOpportunity;
export type PatientLeadRow = PatientLead;
export type TaskRow = Task;
export type StudyRow = Study;
export type StudySiteRow = StudySite;
export type StudyMonitoringVisitRow = StudyMonitoringVisit;
export type ProtocolDeviationRow = ProtocolDeviation;
export type StudyPaymentRow = StudyPayment;
export type PatientVisitRow = PatientVisit;
export type SpecimenRow = Specimen;
export type ShipmentRow = Shipment;
export type InvoiceRow = Invoice;
export type ActionItemRow = ActionItem;
export type DashboardMetricsRow = DashboardMetrics;
export type ActionCenterMetricsRow = ActionCenterMetrics;
export type VActionMetrics = VActionMetricsRow;
export type VHazloMetrics = VHazloMetricsRow;

export type OrganizationInsert = InsertOrganization;
export type ContactInsert = InsertContact;
export type ViloOpportunityInsert = InsertViloOpportunity;
export type PatientLeadInsert = InsertPatientLead;
export type TaskInsert = InsertTask;
export type StudyInsert = InsertStudy;
export type StudySiteInsert = InsertStudySite;
export type StudyMonitoringVisitInsert = InsertStudyMonitoringVisit;
export type ProtocolDeviationInsert = InsertProtocolDeviation;
export type StudyPaymentInsert = InsertStudyPayment;
export type PatientVisitInsert = InsertPatientVisit;
export type SpecimenInsert = InsertSpecimen;
export type ShipmentInsert = InsertShipment;
export type InvoiceInsert = InsertInvoice;
export type ActionItemInsert = InsertActionItem;

export type OrganizationUpdate = Partial<InsertOrganization>;
export type ContactUpdate = Partial<InsertContact>;
export type ViloOpportunityUpdate = Partial<InsertViloOpportunity>;
export type PatientLeadUpdate = Partial<InsertPatientLead>;
export type TaskUpdate = Partial<InsertTask>;
export type StudyUpdate = Partial<InsertStudy>;
export type StudySiteUpdate = Partial<InsertStudySite>;
export type StudyMonitoringVisitUpdate = Partial<InsertStudyMonitoringVisit>;
export type ProtocolDeviationUpdate = Partial<InsertProtocolDeviation>;
export type StudyPaymentUpdate = Partial<InsertStudyPayment>;
export type PatientVisitUpdate = Partial<InsertPatientVisit>;
export type SpecimenUpdate = Partial<InsertSpecimen>;
export type ShipmentUpdate = Partial<InsertShipment>;
export type InvoiceUpdate = Partial<InsertInvoice>;
export type ActionItemUpdate = Partial<InsertActionItem>;

/** @deprecated Prefer `ContactWithOrg` */
export type ContactWithOrganization = ContactWithOrg;
/** @deprecated Prefer `OpportunityWithRefs` */
export type ViloOpportunityWithRelations = OpportunityWithRefs;
