"use server";

import { createServerSideClient } from "@/lib/supabase/server";
import type { PatientVisitStatus, SiteActivation, StudyLifecycle, StudyPaymentStatus } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function money(fd: FormData, key: string): number | null {
  const v = text(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createStudy(formData: FormData) {
  const supabase = await createServerSideClient();
  const name = text(formData, "name");
  if (!name) throw new Error("Study name is required");

  const { error } = await supabase.from("studies").insert({
    name,
    protocol_identifier: text(formData, "protocol_identifier"),
    sponsor_display_name: text(formData, "sponsor_display_name"),
    status: (text(formData, "status") ?? "planning") as StudyLifecycle,
    external_system: null,
    external_id: null,
    notes: text(formData, "notes"),
    archived: false,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/clinical-ops");
}

export async function createStudySite(formData: FormData) {
  const supabase = await createServerSideClient();
  const study_id = text(formData, "study_id");
  const name = text(formData, "name");
  if (!study_id || !name) throw new Error("Study and site name are required");

  const { error } = await supabase.from("study_sites").insert({
    study_id,
    name,
    site_number: text(formData, "site_number"),
    activation_status: (text(formData, "activation_status") ?? "not_started") as SiteActivation,
    activated_at: null,
    external_id: null,
    notes: text(formData, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/clinical-ops");
}

export async function createPatientVisit(formData: FormData) {
  const supabase = await createServerSideClient();
  const visit_name = text(formData, "visit_name");
  if (!visit_name) throw new Error("Visit name is required");

  const { error } = await supabase.from("patient_visits").insert({
    study_id: text(formData, "study_id"),
    patient_lead_id: text(formData, "patient_lead_id"),
    visit_name,
    scheduled_at: text(formData, "scheduled_at"),
    completed_at: null,
    status: "scheduled",
    expected_revenue_usd: money(formData, "expected_revenue_usd"),
    notes: text(formData, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/clinical-ops");
}

export async function updatePatientVisitStatus(formData: FormData) {
  const supabase = await createServerSideClient();
  const id = text(formData, "id");
  const status = text(formData, "status") as PatientVisitStatus | null;
  if (!id || !status) throw new Error("Visit and status are required");

  const { error } = await supabase
    .from("patient_visits")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/clinical-ops");
}

export async function createStudyPayment(formData: FormData) {
  const supabase = await createServerSideClient();
  const study_id = text(formData, "study_id");
  const description = text(formData, "description");
  const amount_usd = money(formData, "amount_usd");
  if (!study_id || !description || amount_usd == null) {
    throw new Error("Study, description, and amount are required");
  }

  const { error } = await supabase.from("study_payments").insert({
    study_id,
    study_site_id: text(formData, "study_site_id"),
    description,
    milestone_label: text(formData, "milestone_label"),
    amount_usd,
    due_date: text(formData, "due_date"),
    paid_at: null,
    status: (text(formData, "status") ?? "planned") as StudyPaymentStatus,
    external_id: null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/clinical-ops");
}
