import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service-role";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function createTaskIfMissing(params: {
  titlePrefix: string;
  title: string;
  channel: "vilo" | "vitalis";
  priority: "High" | "Medium" | "Low";
  due_date: string;
  linked_vitalis_id?: string | null;
  linked_vilo_id?: string | null;
}) {
  const linkField = params.linked_vitalis_id ? "linked_vitalis_id" : "linked_vilo_id";
  const linkId = params.linked_vitalis_id ?? params.linked_vilo_id;
  const { data: existing } = await serviceClient
    .from("tasks")
    .select("id")
    .eq(linkField, linkId!)
    .eq("done", false)
    .ilike("title", `${params.titlePrefix}%`)
    .limit(1);
  if (existing?.length) return null;
  const { data } = await serviceClient
    .from("tasks")
    .insert({
      title: params.title,
      channel: params.channel,
      priority: params.priority,
      due_date: params.due_date,
      done: false,
      linked_vitalis_id: params.linked_vitalis_id ?? null,
      linked_vilo_id: params.linked_vilo_id ?? null,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function runCron() {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const [{ data: noContact }, { data: postVisit }, { data: staleNeg }] = await Promise.all([
    serviceClient
      .from("patient_leads")
      .select("id, full_name")
      .eq("archived", false)
      .is("last_contact_date", null)
      .lt("created_at", cutoff24h)
      .not(
        "current_stage",
        "in",
        '("Enrolled","Screen Fail","Patient Lost","Nurture / Future Study")'
      ),
    serviceClient
      .from("patient_leads")
      .select("id, full_name")
      .eq("archived", false)
      .in("current_stage", ["Scheduled", "Visit Confirmed"])
      .lte("last_contact_date", yesterday.toISOString().slice(0, 10)),
    serviceClient
      .from("vilo_opportunities")
      .select("id, company_name")
      .eq("archived", false)
      .eq("status", "Negotiation")
      .lt("updated_at", cutoff14d),
  ]);

  const created = { noContact24h: 0, postVisit: 0, negotiationStale: 0 };
  for (const lead of noContact ?? []) {
    const id = await createTaskIfMissing({
      titlePrefix: "Follow up",
      title: `Follow up — no contact 24h — ${lead.full_name}`,
      channel: "vitalis",
      priority: "High",
      due_date: today(),
      linked_vitalis_id: lead.id,
    });
    if (id) created.noContact24h++;
  }
  for (const lead of postVisit ?? []) {
    const id = await createTaskIfMissing({
      titlePrefix: "Confirm attendance",
      title: `Confirm attendance — ${lead.full_name}`,
      channel: "vitalis",
      priority: "High",
      due_date: today(),
      linked_vitalis_id: lead.id,
    });
    if (id) created.postVisit++;
  }
  for (const opp of staleNeg ?? []) {
    const id = await createTaskIfMissing({
      titlePrefix: "⚠ Negotiation",
      title: `⚠ Negotiation stale >14 days — ${opp.company_name}`,
      channel: "vilo",
      priority: "High",
      due_date: today(),
      linked_vilo_id: opp.id,
    });
    if (id) created.negotiationStale++;
  }

  return { success: true, ran_at: new Date().toISOString(), tasks_created: created };
}

function authorizeCron(req: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  const bearer = req.headers.get("authorization");
  if (bearer === `Bearer ${CRON_SECRET}`) return true;
  return req.headers.get("x-cron-secret") === CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (CRON_SECRET && !authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runCron());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (CRON_SECRET && !authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runCron());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
