"use client";

import { Button } from "@/components/ui/Button";
import { markSubmissionReviewedAction } from "@/app/(dashboard)/hazlo/review/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ManualReviewCard({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [approved, setApproved] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setMessage(null);
    const res = await markSubmissionReviewedAction(submissionId, approved, notes);
    setSaving(false);
    if (!res.ok) {
      setMessage(res.error ?? "Error");
      return;
    }
    setMessage(approved ? "Marcado como aprobado." : "Marcado para seguimiento.");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4">
      <h3 className="text-sm font-semibold text-clinical-ink">Revisión manual pendiente</h3>
      <p className="mt-1 text-xs text-clinical-muted">
        Cierra la cola de validación: aprueba o deja en revisión con notas (RPC{" "}
        <code className="text-[10px]">mark_submission_reviewed</code>).
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-clinical-ink">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
        Aprobar expediente
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas para el equipo…"
        rows={2}
        className="mt-2 w-full rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm"
      />
      {message ? <p className="mt-2 text-xs text-clinical-muted">{message}</p> : null}
      <Button variant="primary" className="mt-3 text-sm" disabled={saving} onClick={() => void submit()}>
        {saving ? "Guardando…" : "Registrar revisión"}
      </Button>
    </div>
  );
}
