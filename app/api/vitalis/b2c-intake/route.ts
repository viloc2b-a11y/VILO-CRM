import { ingestB2CLead, type B2CLeadInput } from "@/lib/vitalis/intake-engine";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const b2cLeadSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  language: z.string().optional(),
  condition_interest: z.string().optional(),
  source: z.enum(["meta", "whatsapp", "web", "craigslist", "referral", "walkin"]),
  utm_source: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_medium: z.string().optional(),
  consent: z.object({
    sms: z.boolean(),
    whatsapp: z.boolean(),
    email: z.boolean(),
    data: z.boolean(),
  }),
  ip: z.string().optional(),
  user_agent: z.string().optional(),
});

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const secret = process.env.INTAKE_WEBHOOK_SECRET?.trim();
  if (secret) {
    const sent = req.headers.get("x-intake-secret");
    if (sent !== secret) {
      return unauthorized();
    }
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = b2cLeadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const body = parsed.data as B2CLeadInput;
  const ip = body.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const userAgent = body.user_agent ?? req.headers.get("user-agent") ?? undefined;

  try {
    const result = await ingestB2CLead({
      ...body,
      ip,
      user_agent: userAgent,
    });
    const status = result.status === "created" ? 201 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
