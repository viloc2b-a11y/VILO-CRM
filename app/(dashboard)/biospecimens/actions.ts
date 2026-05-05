"use server";

import { createServerSideClient } from "@/lib/supabase/server";
import type { ShipmentStatus, SpecimenStatus } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

export async function createSpecimen(formData: FormData) {
  const supabase = await createServerSideClient();
  const specimen_type = text(formData, "specimen_type");
  if (!specimen_type) throw new Error("Specimen type is required");

  const { error } = await supabase.from("specimens").insert({
    study_id: text(formData, "study_id"),
    patient_visit_id: text(formData, "patient_visit_id"),
    patient_lead_id: text(formData, "patient_lead_id"),
    accession_number: text(formData, "accession_number"),
    specimen_type,
    collected_at: text(formData, "collected_at"),
    processed_at: null,
    status: (text(formData, "status") ?? "planned") as SpecimenStatus,
    current_location: text(formData, "current_location"),
    chain_of_custody: [],
    notes: text(formData, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/biospecimens");
}

export async function updateSpecimenStatus(formData: FormData) {
  const supabase = await createServerSideClient();
  const id = text(formData, "id");
  const status = text(formData, "status") as SpecimenStatus | null;
  if (!id || !status) throw new Error("Specimen and status are required");

  const { error } = await supabase
    .from("specimens")
    .update({
      status,
      processed_at: status === "processed" ? new Date().toISOString() : undefined,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/biospecimens");
}

export async function createShipment(formData: FormData) {
  const supabase = await createServerSideClient();
  const destination_name = text(formData, "destination_name");
  if (!destination_name) throw new Error("Destination is required");

  const { error } = await supabase.from("shipments").insert({
    study_id: text(formData, "study_id"),
    courier: text(formData, "courier"),
    tracking_number: text(formData, "tracking_number"),
    destination_name,
    destination_address: text(formData, "destination_address"),
    shipped_at: text(formData, "shipped_at"),
    delivered_at: null,
    status: (text(formData, "status") ?? "draft") as ShipmentStatus,
    notes: text(formData, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/biospecimens");
}

export async function updateShipmentStatus(formData: FormData) {
  const supabase = await createServerSideClient();
  const id = text(formData, "id");
  const status = text(formData, "status") as ShipmentStatus | null;
  if (!id || !status) throw new Error("Shipment and status are required");

  const { error } = await supabase
    .from("shipments")
    .update({
      status,
      delivered_at: status === "delivered" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/biospecimens");
}
