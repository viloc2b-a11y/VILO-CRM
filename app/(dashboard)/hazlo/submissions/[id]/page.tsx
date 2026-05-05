import { CommunicationTimeline } from "@/components/hazlo/CommunicationTimeline";
import { HazloQuickLogInteraction } from "@/components/hazlo/QuickLogInteraction";
import { createServerSideClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ManualReviewCard } from "./ManualReviewCard";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function jsonPreview(label: string, value: Json | null): ReactNode {
  if (value == null) return null;
  const str = JSON.stringify(value, null, 2);
  if (str === "{}" || str === "null") return null;
  return (
    <details className="mt-2 rounded-lg border border-clinical-line bg-white p-2 text-xs">
      <summary className="cursor-pointer font-medium text-clinical-ink">{label}</summary>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-clinical-muted">{str}</pre>
    </details>
  );
}

export default async function HazloSubmissionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSideClient();

  const { data: sub, error } = await supabase
    .from("submissions")
    .select(
      "id, name, email, phone, funnel_type, completion_status, payment_status, source_campaign, validation_report, validation_ran_at, validation_confidence, needs_manual_review, square_payment_id, square_last_error_code, square_last_error_message, stripe_payment_intent_id, payment_failed_at, payment_recovery_state, growth_state, document_paths, created_at, updated_at",
    )
    .eq("id", id)
    .eq("archived", false)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!sub) {
    notFound();
  }

  const { data: commRows } = await supabase
    .from("communications_log")
    .select("id, channel, direction, type, subject, body, metadata, created_at")
    .eq("submission_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  const acQuery = encodeURIComponent(`submission:${id}`);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-6">
      <div>
        <Link href="/hazlo" className="text-sm text-vilo-700 hover:underline">
          ← Pipeline Hazlo
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-clinical-ink">{sub.name}</h1>
        <p className="mt-1 text-sm text-clinical-muted">
          Trámite: <span className="capitalize text-clinical-ink">{sub.funnel_type.replace(/_/g, " ")}</span>
          {" · "}
          Estado: <span className="font-medium text-clinical-ink">{sub.completion_status}</span>
        </p>
      </div>

      <div className="rounded-lg border border-vilo-200 bg-vilo-50/60 px-4 py-3 text-sm text-clinical-ink">
        <strong>Pagos:</strong> este producto usa <strong>Square</strong> como sistema de cobro canónico (webhook{" "}
        <code className="text-xs">/api/hazlo/square/webhook</code>
        ). Referencias Stripe en la fila son legado; no operes nuevos flujos sobre Stripe.
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-clinical-muted">Email</dt>
          <dd>{sub.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-clinical-muted">Teléfono</dt>
          <dd>{sub.phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-clinical-muted">Pago (estado)</dt>
          <dd className="font-medium">{sub.payment_status ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-clinical-muted">Square payment id</dt>
          <dd className="break-all text-xs">{sub.square_payment_id ?? "—"}</dd>
        </div>
        {sub.square_last_error_code ? (
          <div className="sm:col-span-2">
            <dt className="text-clinical-muted">Último error Square</dt>
            <dd className="text-clinical-alert">
              {sub.square_last_error_code}: {sub.square_last_error_message ?? ""}
            </dd>
          </div>
        ) : null}
        {sub.stripe_payment_intent_id ? (
          <div className="sm:col-span-2">
            <dt className="text-clinical-muted">Stripe (legado)</dt>
            <dd className="break-all text-xs opacity-80">{sub.stripe_payment_intent_id}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-clinical-muted">Validación (confianza)</dt>
          <dd>
            {sub.validation_confidence != null ? `${Math.round(sub.validation_confidence * 100)}%` : "—"}
            {sub.validation_ran_at ? ` · ${sub.validation_ran_at}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-clinical-muted">Campaña</dt>
          <dd>{sub.source_campaign ?? "—"}</dd>
        </div>
      </dl>

      {jsonPreview("Informe de validación", sub.validation_report as Json | null)}
      {jsonPreview("Recovery state", sub.payment_recovery_state as Json | null)}
      {jsonPreview("Growth state", sub.growth_state as Json | null)}
      {jsonPreview("Document paths (Storage)", sub.document_paths as Json | null)}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/action-center?bu=hazloasiya&record=${acQuery}`}
          className="text-sm font-medium text-vilo-700 underline-offset-2 hover:underline"
        >
          Ver tareas en Action Center →
        </Link>
        <Link href="/hazlo/review" className="text-sm text-clinical-muted hover:text-clinical-ink">
          Cola de revisión →
        </Link>
      </div>

      {sub.needs_manual_review ? (
        <ManualReviewCard submissionId={sub.id} />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-clinical-ink">Timeline</h2>
          <div className="rounded-xl border border-clinical-line bg-white p-4 shadow-card">
            <CommunicationTimeline logs={commRows ?? []} />
          </div>
        </div>
        <div>
          <HazloQuickLogInteraction recordType="submission" recordId={sub.id} />
        </div>
      </div>
    </div>
  );
}
