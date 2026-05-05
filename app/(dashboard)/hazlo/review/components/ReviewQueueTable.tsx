"use client";

import { markSubmissionReviewedAction } from "../actions";
import type { VHazloReviewQueueRow } from "@/lib/supabase/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

function confidenceTextClass(confidence: number | null): string {
  if (confidence == null) return "text-clinical-muted";
  if (confidence >= 0.85) return "text-green-600";
  if (confidence >= 0.7) return "text-amber-600";
  return "text-red-600";
}

function funnelLabel(funnel: string): string {
  return funnel.replace(/_/g, " ");
}

export function ReviewQueueTable({
  initialQueue,
  loadError,
}: {
  initialQueue: VHazloReviewQueueRow[];
  loadError?: string;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setQueue(initialQueue);
  }, [initialQueue]);

  const empty = useMemo(() => queue.length === 0, [queue.length]);

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        {loadError}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="rounded-xl border border-clinical-line bg-white p-8 text-center text-sm text-clinical-muted">
        No hay documentos pendientes de revisión en esta vista.
      </div>
    );
  }

  function setNote(id: string, value: string) {
    setNotesById((prev) => ({ ...prev, [id]: value }));
  }

  function notesForRpc(id: string, approved: boolean): string {
    const raw = (notesById[id] ?? "").trim();
    if (raw) return raw;
    return approved ? "Aprobado por revisor" : "Rechazado por revisor";
  }

  function handleReview(submissionId: string, approved: boolean) {
    setMessage(null);
    setActingId(submissionId);
    startTransition(async () => {
      const res = await markSubmissionReviewedAction(
        submissionId,
        approved,
        notesForRpc(submissionId, approved),
      );
      setActingId(null);
      if (!res.ok) {
        setMessage(res.error ?? "Error al guardar la revisión");
        return;
      }
      setReviewingId(null);
      setNotesById((prev) => {
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-clinical-line bg-white shadow-sm">
      <div className="border-b border-clinical-line p-4">
        <h2 className="font-semibold text-clinical-ink">
          Cola de revisión ({queue.length} pendientes)
        </h2>
        <p className="text-sm text-clinical-muted">
          Confianza menor a 85% requiere revisión manual.
        </p>
      </div>
      {message && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {message}
        </div>
      )}
      <div className="divide-y divide-clinical-line">
        {queue.map((item) => {
          const conf = item.validation_confidence ?? 0;
          const errors = item.validation_errors ?? [];
          const busy = pending && actingId === item.id;
          const note = notesById[item.id] ?? "";
          const approveBlocked = conf < 0.5 && !note.trim();

          return (
            <div key={item.id} className="p-4 transition-colors hover:bg-clinical-paper/50">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-medium text-clinical-ink">
                      {item.contact_name?.trim() || "Sin nombre"}
                    </h3>
                    <span
                      className={`font-mono text-sm font-medium ${confidenceTextClass(item.validation_confidence)}`}
                    >
                      {(conf * 100).toFixed(0)}% confianza
                    </span>
                  </div>
                  <p className="text-xs text-clinical-muted">
                    {format(new Date(item.created_at), "d MMM yyyy HH:mm", { locale: es })}
                  </p>

                  <div className="space-y-1 text-sm text-clinical-muted">
                    <div>
                      <span className="font-medium text-clinical-ink">Trámite:</span>{" "}
                      {funnelLabel(item.funnel_type)}
                    </div>
                    <div>
                      <span className="font-medium text-clinical-ink">Email:</span>{" "}
                      {item.contact_email ?? "—"}
                    </div>
                    <div>
                      <span className="font-medium text-clinical-ink">Teléfono:</span>{" "}
                      {item.contact_phone ?? "—"}
                    </div>
                    <div>
                      <span className="font-medium text-clinical-ink">Documentos:</span>{" "}
                      {item.document_key_count} archivos
                    </div>
                  </div>

                  {errors.length > 0 && (
                    <div className="text-sm text-red-700">
                      <span className="font-medium">Errores detectados:</span>
                      <ul className="mt-1 list-inside list-disc">
                        {errors.slice(0, 3).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {errors.length > 3 && (
                          <li className="text-clinical-muted">
                            +{errors.length - 3} más
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  <Link
                    href={`/action-center?bu=hazloasiya&record=submission:${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-vilo-700 underline-offset-4 hover:underline"
                  >
                    Ver en Action Center →
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setReviewingId(reviewingId === item.id ? null : item.id)
                    }
                    className="rounded-md bg-vilo-600 px-3 py-1 text-sm font-medium text-white hover:bg-vilo-700 disabled:opacity-50"
                  >
                    {reviewingId === item.id ? "Cancelar" : "Revisar"}
                  </button>
                </div>
              </div>

              {reviewingId === item.id && (
                <div className="mt-4 space-y-3 rounded-lg border border-clinical-line bg-clinical-paper/80 p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-clinical-ink">
                      Notas de revisión (opcional)
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(item.id, e.target.value)}
                      disabled={busy}
                      rows={3}
                      placeholder="Ej.: SSN visible pero fecha borrosa — aprobar con seguimiento"
                      className="w-full rounded-md border border-clinical-line bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy || approveBlocked}
                      onClick={() => handleReview(item.id, true)}
                      className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleReview(item.id, false)}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                  </div>
                  {approveBlocked && (
                    <p className="text-xs text-amber-800">
                      Confianza muy baja (&lt;50%). Añade una nota que explique la decisión para
                      aprobar.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
