"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  organizationId: string;
  organizationName: string;
  /** Primer email de contacto de la org, si existe. */
  defaultRecipientEmail?: string | null;
};

export function OrganizationReportActions({
  organizationId,
  organizationName,
  defaultRecipientEmail,
}: Props) {
  const [sending, setSending] = useState(false);

  async function handleSendReport() {
    setSending(true);
    try {
      const recipient =
        defaultRecipientEmail?.trim() || process.env.NEXT_PUBLIC_DEFAULT_REPORT_EMAIL?.trim() || undefined;

      const res = await fetch("/api/notifications/report-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_name: organizationName,
          company_id: organizationId,
          report_url: `/api/reports/sponsor/${organizationId}/pdf`,
          channel: "both",
          ...(recipient ? { recipient } : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };
      if (!res.ok) {
        throw new Error(data.error || res.statusText);
      }
      if (data.success === false) {
        throw new Error("notification_failed");
      }
      window.alert("Notificación enviada (email y/o Slack según configuración).");
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Error al enviar notificación");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <Link
        href={`/api/reports/sponsor/${organizationId}/pdf`}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
        target="_blank"
        rel="noopener noreferrer"
        download
      >
        📄 Descargar reporte PDF
      </Link>
      <button
        type="button"
        onClick={() => void handleSendReport()}
        disabled={sending}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
      >
        {sending ? "⏳ Enviando…" : "📧 Enviar por email / Slack"}
      </button>
    </div>
  );
}
