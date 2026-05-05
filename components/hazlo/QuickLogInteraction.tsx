"use client";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type HazloQuickLogOption = { value: string; label: string };

export type HazloQuickLogProps = {
  recordType: "submission";
  recordId: string;
  channels?: HazloQuickLogOption[];
  types?: HazloQuickLogOption[];
  defaultDirection?: "outbound" | "inbound" | "internal";
};

const DEFAULT_CHANNELS: HazloQuickLogOption[] = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "call", label: "Llamada" },
];

const DEFAULT_TYPES: HazloQuickLogOption[] = [
  { value: "payment_reminder", label: "Recordatorio de pago (Square)" },
  { value: "recovery_touch", label: "Toque recovery" },
  { value: "growth_offer", label: "Oferta growth" },
  { value: "document_request", label: "Solicitud de documentos" },
  { value: "support_resolved", label: "Soporte resuelto" },
  { value: "note", label: "Nota interna" },
];

export function HazloQuickLogInteraction({
  recordType,
  recordId,
  channels = DEFAULT_CHANNELS,
  types = DEFAULT_TYPES,
  defaultDirection = "outbound",
}: HazloQuickLogProps) {
  const router = useRouter();
  const channelValues = useMemo(() => new Set(channels.map((c) => c.value)), [channels]);
  const firstChannel = channels[0]?.value ?? "email";
  const [channel, setChannel] = useState(firstChannel);
  const [type, setType] = useState(types[0]?.value ?? "note");
  const [direction, setDirection] = useState(defaultDirection);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLog() {
    setError(null);
    if (!recordId?.trim()) {
      setError("Falta recordId.");
      return;
    }
    if (recordType !== "submission") {
      setError("Solo recordType submission está soportado.");
      return;
    }
    if (!channelValues.has(channel)) {
      setError("Canal no válido.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/hazlo/communications/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: "submission",
          submissionId: recordId.trim(),
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
      <p className="text-xs text-clinical-muted">
        Pagos y webhooks operativos: <strong>Square</strong> (canónico en este stack).
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Canal">
          {channels.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo">
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>
      <Select
        value={direction}
        onChange={(e) => setDirection(e.target.value as typeof direction)}
        aria-label="Dirección"
      >
        <option value="outbound">Saliente</option>
        <option value="inbound">Entrante</option>
        <option value="internal">Interna / nota</option>
      </Select>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Detalles (evitá datos sensibles innecesarios)…"
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
