import type {
  InsertContact,
  InsertPatientLead,
  InsertTask,
  InsertViloOpportunity,
} from "@/lib/supabase/types";

type ViloPatch = Partial<InsertViloOpportunity>;
type PatientPatch = Partial<InsertPatientLead>;

/** Full insert (Vilo). */
export function validateViloOpportunity(payload: InsertViloOpportunity): void {
  const errors: string[] = [];
  if (!payload.company_name?.trim()) errors.push("company_name is required");
  if (payload.potential_value !== undefined && payload.potential_value !== null && payload.potential_value < 0) {
    errors.push("potential_value must be positive");
  }
  if (payload.next_followup_date && payload.last_contact_date) {
    if (payload.next_followup_date < payload.last_contact_date) {
      errors.push("next_followup_date cannot be before last_contact_date");
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
}

/** Partial update — only validates fields present on the patch. */
export function validateViloOpportunityPatch(payload: ViloPatch): void {
  const errors: string[] = [];
  if (payload.company_name !== undefined && !payload.company_name.trim()) {
    errors.push("company_name is required");
  }
  if (payload.potential_value !== undefined && payload.potential_value !== null && payload.potential_value < 0) {
    errors.push("potential_value must be positive");
  }
  if (payload.next_followup_date && payload.last_contact_date) {
    if (payload.next_followup_date < payload.last_contact_date) {
      errors.push("next_followup_date cannot be before last_contact_date");
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
}

/** Full insert (patient lead). */
export function validatePatientLead(payload: InsertPatientLead): void {
  const errors: string[] = [];
  if (!payload.full_name?.trim()) errors.push("full_name is required");
  if (!payload.phone?.trim()) errors.push("phone is required");
  if (payload.email && !payload.email.includes("@")) errors.push("invalid email format");
  if (payload.current_stage === "Screen Fail" && !payload.screen_fail_reason?.trim()) {
    errors.push("screen_fail_reason is required when stage is Screen Fail");
  }
  if (errors.length) throw new Error(errors.join("; "));
}

export function validatePatientLeadPatch(payload: PatientPatch): void {
  const errors: string[] = [];
  if (payload.full_name !== undefined && !payload.full_name.trim()) errors.push("full_name is required");
  if (payload.phone !== undefined && !payload.phone.trim()) errors.push("phone is required");
  if (payload.email !== undefined && payload.email && !payload.email.includes("@")) {
    errors.push("invalid email format");
  }
  if (payload.current_stage === "Screen Fail" && !payload.screen_fail_reason?.trim()) {
    errors.push("screen_fail_reason is required when stage is Screen Fail");
  }
  if (errors.length) throw new Error(errors.join("; "));
}

export function validateContact(payload: InsertContact): void {
  const errors: string[] = [];
  if (!payload.full_name?.trim()) errors.push("full_name is required");
  if (payload.email && !payload.email.includes("@")) errors.push("invalid email format");
  if (errors.length) throw new Error(errors.join("; "));
}

export function validateTask(payload: InsertTask): void {
  const errors: string[] = [];
  if (!payload.title?.trim()) errors.push("title is required");
  if (!payload.due_date) errors.push("due_date is required");
  if (payload.linked_vilo_id && payload.linked_vitalis_id) {
    errors.push("task cannot link to both a Vilo record and a Vitalis record");
  }
  if (payload.channel === "vilo" && payload.linked_vitalis_id) {
    errors.push("vilo task cannot link to a patient lead");
  }
  if (payload.channel === "vitalis" && payload.linked_vilo_id) {
    errors.push("vitalis task cannot link to a vilo opportunity");
  }
  if (errors.length) throw new Error(errors.join("; "));
}
