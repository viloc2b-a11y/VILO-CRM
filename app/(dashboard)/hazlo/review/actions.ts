"use server";

import { createServerSideClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function markSubmissionReviewedAction(
  submissionId: string,
  approved: boolean,
  notes: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSideClient();
  const { error } = await supabase.rpc("mark_submission_reviewed", {
    p_submission_id: submissionId,
    p_approved: approved,
    p_notes: notes.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hazlo/review");
  revalidatePath("/hazlo");
  revalidatePath(`/hazlo/submissions/${submissionId}`);
  return { ok: true };
}
