import { IngestionCenterClient, type StagingRow } from "./IngestionCenterClient";
import { createServerSideClient } from "@/lib/supabase/server";

type OrgOption = { id: string; name: string };
type ContactOption = { id: string; full_name: string; org_id: string | null };
type LooseRow = Record<string, unknown>;
type LooseResult<T = LooseRow> = { data: T[] | T | null; error: { message: string } | null };
type LooseQuery<T = LooseRow> = PromiseLike<LooseResult<T>> & {
  select: (columns?: string) => LooseQuery<T>;
  eq: (column: string, value: unknown) => LooseQuery<T>;
  order: (column: string, options?: LooseRow) => LooseQuery<T>;
  limit: (count: number) => LooseQuery<T>;
};
type LooseClient = { from: (table: string) => LooseQuery };

export default async function IngestionCenterPage() {
  const sb = (await createServerSideClient()) as unknown as LooseClient;
  const [orgsRes, contactsRes, stagingRes] = await Promise.all([
    sb.from("organizations").select("id,name").eq("archived", false).order("name"),
    sb.from("contacts").select("id,full_name,org_id").eq("archived", false).order("full_name"),
    sb
      .from("ingestion_staging")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then((r) => r, () => ({ data: [], error: null })),
  ]);

  return (
    <IngestionCenterClient
      organizations={(orgsRes.data ?? []) as OrgOption[]}
      contacts={(contactsRes.data ?? []) as ContactOption[]}
      stagingRows={(stagingRes.data ?? []) as StagingRow[]}
      stagingAvailable={!stagingRes.error}
    />
  );
}
