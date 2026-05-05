import { CommunicationTimeline } from "@/components/vitalis/CommunicationTimeline";
import { QuickLogInteraction } from "@/components/vitalis/QuickLogInteraction";
import { createServerSideClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function VitalisPatientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSideClient();

  const { data: lead, error } = await supabase
    .from("patient_leads")
    .select(
      "id, full_name, phone, email, source_campaign, current_stage, next_action, last_contact_channel, notes, updated_at",
    )
    .eq("id", id)
    .eq("archived", false)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!lead) {
    notFound();
  }

  const { data: commRows } = await supabase
    .from("communications_log")
    .select("id, channel, direction, type, subject, body, metadata, created_at")
    .eq("patient_lead_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="p-4 md:p-6">
      <Link href="/vitalis" className="text-sm text-vitalis-700 hover:underline">
        ← Pipeline
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-clinical-ink">{lead.full_name}</h1>
      <p className="mt-1 text-sm text-clinical-muted">
        Etapa: <span className="font-medium text-clinical-ink">{lead.current_stage}</span>
      </p>

      <dl className="mt-6 grid max-w-lg gap-3 text-sm">
        <div>
          <dt className="text-clinical-muted">Teléfono</dt>
          <dd className="text-clinical-ink">{lead.phone}</dd>
        </div>
        <div>
          <dt className="text-clinical-muted">Email</dt>
          <dd className="text-clinical-ink">{lead.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-clinical-muted">Fuente / campaña</dt>
          <dd className="text-clinical-ink">{lead.source_campaign ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-clinical-muted">Último canal</dt>
          <dd className="text-clinical-ink">{lead.last_contact_channel ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-clinical-muted">Siguiente acción</dt>
          <dd className="text-clinical-ink">{lead.next_action ?? "—"}</dd>
        </div>
        {lead.notes ? (
          <div>
            <dt className="text-clinical-muted">Notas</dt>
            <dd className="whitespace-pre-wrap text-clinical-ink">{lead.notes}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-clinical-ink">Timeline</h2>
          <div className="rounded-xl border border-clinical-line bg-white p-4 shadow-card">
            <CommunicationTimeline logs={commRows ?? []} />
          </div>
        </div>
        <div>
          <QuickLogInteraction
            recordType="patient"
            recordId={lead.id}
            channels={[
              { value: "whatsapp", label: "💬 WhatsApp" },
              { value: "sms", label: "📱 SMS" },
              { value: "call", label: "📞 Llamada" },
              { value: "email", label: "📧 Email" },
            ]}
            types={[
              { value: "prescreen_sent", label: "Prescreen enviado" },
              { value: "call_reached", label: "Llamada contestada" },
              { value: "call_no_answer", label: "No contestó" },
              { value: "voicemail_left", label: "Buzón de voz" },
              { value: "visit_scheduled", label: "Visita agendada" },
              { value: "no_show", label: "No asistió" },
              { value: "note", label: "Nota interna" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
