import { ReviewQueueTable } from "./components/ReviewQueueTable";
import { ReviewStats, type HazloReviewStats } from "./components/ReviewStats";
import { createServerSideClient } from "@/lib/supabase/server";
import type { Json, VHazloReviewQueueRow } from "@/lib/supabase/types";
import Link from "next/link";

function utcTodayIsoRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function excludeApprovedManualReview(rows: VHazloReviewQueueRow[]): VHazloReviewQueueRow[] {
  return rows.filter((row) => {
    const r = row.validation_report as Json | null;
    if (r && typeof r === "object" && !Array.isArray(r)) {
      const mr = (r as { manual_review?: { approved?: boolean } }).manual_review;
      if (mr?.approved === true) return false;
    }
    return true;
  });
}

function countApprovedRejectedToday(
  rows: { validation_report: Json | null }[] | null,
  startIso: string,
  endIso: string,
): { approved: number; rejected: number } {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  let approved = 0;
  let rejected = 0;
  for (const row of rows ?? []) {
    const r = row.validation_report;
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const mr = (r as { manual_review?: { reviewed_at?: string; approved?: boolean } }).manual_review;
    if (!mr?.reviewed_at) continue;
    const t = new Date(mr.reviewed_at).getTime();
    if (t >= start && t < end) {
      if (mr.approved === true) approved++;
      else rejected++;
    }
  }
  return { approved, rejected };
}

export default async function HazloReviewQueuePage() {
  const supabase = await createServerSideClient();
  const { start, end } = utcTodayIsoRange();

  const [queueRes, pendingHead, criticalHead, confRes, todayRes] = await Promise.all([
    supabase
      .from("v_hazlo_review_queue")
      .select("*")
      .order("validation_confidence", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase.from("v_hazlo_review_queue").select("*", { count: "exact", head: true }),
    supabase
      .from("v_hazlo_review_queue")
      .select("*", { count: "exact", head: true })
      .lt("validation_confidence", 0.5),
    supabase.from("v_hazlo_review_queue").select("validation_confidence"),
    supabase
      .from("submissions")
      .select("validation_report")
      .eq("archived", false)
      .gte("validation_report->manual_review->>reviewed_at", start)
      .lt("validation_report->manual_review->>reviewed_at", end),
  ]);

  const queueError = queueRes.error?.message;
  const statsHeadError = pendingHead.error?.message ?? criticalHead.error?.message;

  const rawQueue = (queueRes.data ?? []) as VHazloReviewQueueRow[];
  const queue = excludeApprovedManualReview(rawQueue);

  const confidences = confRes.error
    ? []
    : (confRes.data ?? [])
        .map((r) => r.validation_confidence)
        .filter((c): c is number => typeof c === "number" && !Number.isNaN(c));
  const avg_confidence = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : null;

  const { approved: approved_today, rejected: rejected_today } = todayRes.error
    ? { approved: 0, rejected: 0 }
    : countApprovedRejectedToday(todayRes.data ?? null, start, end);

  let stats: HazloReviewStats | null = null;
  if (!statsHeadError) {
    stats = {
      pending_reviews: pendingHead.count ?? 0,
      critical_reviews: criticalHead.count ?? 0,
      avg_confidence,
      approved_today,
      rejected_today,
    };
  }

  return (
    <div className="min-h-screen bg-clinical-paper/80">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-clinical-ink">Revisión manual de documentos</h1>
            <p className="mt-1 text-sm text-clinical-muted">
              Expedientes con confianza del validador por debajo de 0,85 (RLS Hazlo).
            </p>
          </div>
          <Link
            href="/hazlo"
            className="text-sm font-medium text-vilo-700 underline-offset-4 hover:underline"
          >
            ← Volver al pipeline
          </Link>
        </header>

        <ReviewStats data={stats} loadError={statsHeadError} />
        <ReviewQueueTable initialQueue={queue} loadError={queueError} />
      </div>
    </div>
  );
}
