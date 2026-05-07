import { IngestionCenterClient, type StagingRow } from "./IngestionCenterClient";
import { createServerSideClient } from "@/lib/supabase/server";

type OrgOption = { id: string; name: string };
type ContactOption = { id: string; full_name: string; org_id: string | null };
type StudyOption = { id: string; name: string };
type LooseRow = Record<string, unknown>;
type LooseResult<T = LooseRow> = { data: T[] | T | null; error: { message: string } | null };
type LooseQuery<T = LooseRow> = PromiseLike<LooseResult<T>> & {
  select: (columns?: string) => LooseQuery<T>;
  eq: (column: string, value: unknown) => LooseQuery<T>;
  order: (column: string, options?: LooseRow) => LooseQuery<T>;
  limit: (count: number) => LooseQuery<T>;
  maybeSingle: () => PromiseLike<LooseResult<T>>;
};
type LooseClient = { from: (table: string) => LooseQuery };

async function tableAvailable(sb: LooseClient, table: string): Promise<boolean> {
  const { error } = await sb.from(table).select("id").limit(1).then((r) => r, () => ({ data: null, error: { message: "missing" } }));
  return !error;
}

export default async function IngestionCenterPage() {
  const sb = (await createServerSideClient()) as unknown as LooseClient;
  const [orgsRes, contactsRes, studiesRes, stagingRes, availabilityChecks] = await Promise.all([
    sb.from("organizations").select("id,name").eq("archived", false).order("name"),
    sb.from("contacts").select("id,full_name,org_id").eq("archived", false).order("full_name"),
    sb
      .from("studies")
      .select("id,name")
      .eq("archived", false)
      .order("name")
      .then((r) => r, () => ({ data: [], error: null })),
    sb
      .from("ingestion_staging")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then((r) => r, () => ({ data: [], error: null })),
    Promise.all([
      tableAvailable(sb, "organizations"),
      tableAvailable(sb, "contacts"),
      tableAvailable(sb, "vilo_opportunities"),
      tableAvailable(sb, "studies"),
      tableAvailable(sb, "communications_log"),
      tableAvailable(sb, "patient_leads"),
      tableAvailable(sb, "invoices"),
      tableAvailable(sb, "tasks"),
    ]),
  ]);
  const [organization, contact, opportunity, study, communication, patientLead, financial, task] = availabilityChecks;

  return (
    <IngestionCenterClient
      organizations={(orgsRes.data ?? []) as OrgOption[]}
      contacts={(contactsRes.data ?? []) as ContactOption[]}
      studies={(studiesRes.data ?? []) as StudyOption[]}
      stagingRows={(stagingRes.data ?? []) as StagingRow[]}
      stagingAvailable={!stagingRes.error}
      availableEntities={{ organization, contact, opportunity, study, communication, patient_lead: patientLead, financial, task }}
    />
  );
}
