"use client";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type QuickLogInteractionProps = {
  contactId?: string | null;
  /** `organizations.id` (alias legacy: companyId en API). */
  orgId?: string | null;
  opportunityId?: string | null;
  /** Por defecto `outbound`; usar `internal` para notas de equipo. */
  defaultDirection?: "outbound" | "inbound" | "internal";
};

export function QuickLogInteraction({
  contactId,
  orgId,
  opportunityId,
  defaultDirection = "outbound",
}: QuickLogInteractionProps) {
  const router = useRouter();
  const [channel, setChannel] = useState("email");
  const [type, setType] = useState("follow_up");
  const [direction, setDirection] = useState(defaultDirection);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLog() {
    setError(null);
    if (!contactId?.trim() && !orgId?.trim() && !opportunityId?.trim()) {
      setError("Falta contacto, organización u oportunidad.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/vilo/communications/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contactId?.trim() || undefined,
          orgId: orgId?.trim() || undefined,
          opportunityId: opportunityId?.trim() || undefined,
          channel,
          type,
          body,
          direction,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo guardar");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-clinical-line bg-clinical-paper p-4">
      <h4 className="text-sm font-semibold text-clinical-ink">Registrar interacción</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Canal">
          <option value="email">Email</option>
          <option value="linkedin">LinkedIn</option>
          <option value="call">Llamada</option>
          <option value="meeting">Reunión</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="other">Otro</option>
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo">
          <option value="intro">Intro</option>
          <option value="follow_up">Follow-up</option>
          <option value="proposal">Propuesta</option>
          <option value="note">Nota</option>
        </Select>
      </div>
      <Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} aria-label="Dirección">
        <option value="outbound">Saliente</option>
        <option value="inbound">Entrante</option>
        <option value="internal">Interna / nota</option>
      </Select>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Detalles de la interacción…"
        rows={3}
        className={cn(
          "w-full rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink shadow-sm outline-none placeholder:text-clinical-muted/70 focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200",
        )}
      />
      {error ? <p className="text-xs text-clinical-alert">{error}</p> : null}
      <Button variant="primary" className="text-sm" onClick={() => void handleLog()} disabled={saving}>
        {saving ? "Guardando…" : "Guardar en timeline"}
      </Button>
    </div>
  );
}
