"use server";

import { createServerSideClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function money(fd: FormData, key: string): number {
  const n = Number(text(fd, key) ?? "0");
  return Number.isFinite(n) ? n : 0;
}

export async function createInvoice(formData: FormData) {
  const supabase = await createServerSideClient();
  const amount = money(formData, "amount_usd");
  if (amount <= 0) throw new Error("Invoice amount must be greater than zero");

  const { error } = await supabase.from("invoices").insert({
    study_id: text(formData, "study_id"),
    organization_id: text(formData, "organization_id"),
    invoice_number: text(formData, "invoice_number"),
    status: (text(formData, "status") ?? "draft") as InvoiceStatus,
    amount_usd: amount,
    pass_through_costs_usd: money(formData, "pass_through_costs_usd"),
    due_date: text(formData, "due_date"),
    sent_at: null,
    paid_at: null,
    notes: text(formData, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/financials");
}

export async function updateInvoiceStatus(formData: FormData) {
  const supabase = await createServerSideClient();
  const id = text(formData, "id");
  const status = text(formData, "status") as InvoiceStatus | null;
  if (!id || !status) throw new Error("Invoice and status are required");

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("invoices")
    .update({
      status,
      sent_at: status === "sent" ? now : undefined,
      paid_at: status === "paid" ? now : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/financials");
}
