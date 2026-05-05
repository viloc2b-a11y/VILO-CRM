"use client";

import { cn } from "@/lib/cn";
import type { Json } from "@/lib/supabase/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Calendar,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Share2,
  type LucideIcon,
} from "lucide-react";

export type CommLogRow = {
  id: string;
  channel: string;
  direction: string;
  type: string | null;
  subject: string | null;
  body: string | null;
  metadata: Json | null;
  created_at: string;
};

const CHANNEL_ICON: Record<string, LucideIcon> = {
  email: Mail,
  linkedin: Share2,
  call: Phone,
  meeting: Calendar,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  other: MoreHorizontal,
};

function metaRecord(m: Json | null): Record<string, unknown> {
  if (m && typeof m === "object" && !Array.isArray(m)) {
    return m as Record<string, unknown>;
  }
  return {};
}

export function CommunicationTimeline({ logs }: { logs: CommLogRow[] }) {
  if (!logs.length) {
    return (
      <div className="py-8 text-center text-sm text-clinical-muted">Sin interacciones registradas</div>
    );
  }

  return (
    <div className="relative ml-4 space-y-4 border-l-2 border-clinical-line pl-6">
      {logs.map((log) => {
        const Icon = CHANNEL_ICON[log.channel] ?? MoreHorizontal;
        const meta = metaRecord(log.metadata);
        const opens = typeof meta.opens === "number" ? meta.opens : Number(meta.opens ?? 0) || 0;
        const clicks = typeof meta.clicks === "number" ? meta.clicks : Number(meta.clicks ?? 0) || 0;
        const replied = meta.replied === true || meta.replied === "true";
        const lastEvent = typeof meta.resend_last_event === "string" ? meta.resend_last_event : null;

        return (
          <div key={log.id} className="relative">
            <div
              className={cn(
                "absolute -left-[31px] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-clinical-line bg-white shadow-sm",
                log.direction === "inbound" ? "text-emerald-700" : "text-vilo-700",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </div>
            <div className="rounded-lg border border-clinical-line bg-white p-3 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-clinical-ink">
                    {log.subject?.trim() || `Interacción: ${log.type ?? log.channel}`}
                  </div>
                  <div className="mt-0.5 text-xs capitalize text-clinical-muted">
                    {log.channel} · {log.direction}
                    {lastEvent ? ` · ${lastEvent}` : null}
                  </div>
                </div>
                <time
                  className="shrink-0 text-xs text-clinical-muted"
                  dateTime={log.created_at}
                >
                  {format(new Date(log.created_at), "dd MMM HH:mm", { locale: es })}
                </time>
              </div>
              {log.body?.trim() ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-clinical-muted">{log.body}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-clinical-muted">
                {opens > 0 ? <span className="text-clinical-alert">Aperturas: {opens}</span> : null}
                {clicks > 0 ? <span className="text-vilo-800">Clics: {clicks}</span> : null}
                {replied ? <span className="font-medium text-emerald-700">Respondió</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
