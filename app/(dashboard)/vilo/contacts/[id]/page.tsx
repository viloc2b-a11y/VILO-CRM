import { CommunicationTimeline, type CommLogRow } from "./components/CommunicationTimeline";
import { QuickLogInteraction } from "@/components/vilo/QuickLogInteraction";
import { createServerSideClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ContactCommunicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSideClient();

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, full_name")
    .eq("id", id)
    .eq("archived", false)
    .maybeSingle();

  if (contactErr || !contact) {
    notFound();
  }

  const c = contact as { id: string; full_name: string; org_id: string | null };

  const { data: rawLogs, error: logErr } = await supabase
    .from("communications_log")
    .select("id, channel, direction, type, subject, body, metadata, created_at")
    .eq("contact_id", id)
    .order("created_at", { ascending: false });

  if (logErr) {
    throw new Error(logErr.message);
  }

  const logs = (rawLogs ?? []) as CommLogRow[];

  const { data: latestOpp } = await supabase
    .from("vilo_opportunities")
    .select("id")
    .eq("contact_id", id)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <Link
          href="/contacts"
          className="text-sm font-medium text-vilo-700 underline-offset-2 hover:underline"
        >
          ← Contacts
        </Link>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo Research</div>
        <h1 className="text-2xl font-semibold text-clinical-ink">Historial de comunicaciones</h1>
        <p className="mt-1 text-sm text-clinical-muted">{c.full_name}</p>
      </div>
      <div className="mb-6 max-w-xl">
        <QuickLogInteraction contactId={c.id} orgId={c.org_id} opportunityId={latestOpp?.id ?? null} />
      </div>
      <CommunicationTimeline logs={logs} />
    </div>
  );
}
