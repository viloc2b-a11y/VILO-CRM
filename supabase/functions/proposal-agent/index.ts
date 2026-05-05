/**
 * Edge Function: Proposal Agent — borrador PDF para oportunidades en Negociación.
 *
 * Disparo: cron (recomendado cada 1–6 h) u on-demand. Procesa filas con
 * `status = 'Negotiation'` y `proposal_pdf_path` IS NULL (primera vez en la etapa).
 *
 * Datos: organizations + vilo_opportunities (tipo fase, valor, área terapéutica).
 * `opportunity_type` en BD es Phase I… / Lab/Biobank (no "IVD" literal); el PDF
 * agrupa en categorías comerciales (ensayo, biospecimen, etc.).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *          APP_URL (origen del logo, ej. https://tu-crm.vercel.app),
 *          PROPOSAL_LOGO_URL (opcional; sobreescribe logo),
 *          CRON_SECRET (opcional; header x-cron-secret).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "npm:pdf-lib@1.17.1";

type OppType =
  | "Phase I"
  | "Phase II"
  | "Phase III"
  | "Phase IV"
  | "Observational"
  | "Registry"
  | "Lab/Biobank";

type OrgRow = {
  id: string;
  name: string;
  type: string;
  website: string | null;
  notes: string | null;
};

type OppRow = {
  id: string;
  org_id: string | null;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  status: string;
  opportunity_type: OppType | null;
  therapeutic_area: string | null;
  priority: string;
  potential_value: number | null;
  notes: string | null;
  next_followup_date: string | null;
  created_at: string;
  organizations: OrgRow | null;
};

function commercialCategory(t: OppType | null): string {
  if (!t) return "Servicio clínico / a definir";
  if (t === "Lab/Biobank") return "Biospecimen / biobanco";
  if (t === "Registry") return "Registro / cohorte";
  if (t === "Observational") return "Estudio observacional";
  return `Ensayo clínico (${t})`;
}

function templateIntro(t: OppType | null): string {
  const cat = commercialCategory(t);
  return (
    `Este borrador describe el alcance tipo «${cat}» para el cliente indicado abajo. ` +
    `Los importes y hitos son orientativos hasta revisión legal y operativa.`
  );
}

function milestoneText(value: number | null): string {
  if (value == null || !Number.isFinite(Number(value))) {
    return "Hitos sugeridos: 30% a la firma del acuerdo, 40% al inicio operativo, 30% al cierre de entregables (ajustar en revisión).";
  }
  const v = Number(value);
  const m1 = (v * 0.3).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const m2 = (v * 0.4).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const m3 = (v * 0.3).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (
    `Valor referencial total: USD ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}. ` +
    `Hitos orientativos: USD ${m1} (firma), USD ${m2} (inicio), USD ${m3} (cierre).`
  );
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  color: ReturnType<typeof rgb>,
): number {
  const paragraphs = text.split(/\n/);
  let yy = y;
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const wdt = font.widthOfTextAtSize(test, size);
      if (wdt > maxWidth && line) {
        page.drawText(line, { x, y: yy, size, font, color });
        yy -= size + 3;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line, { x, y: yy, size, font, color });
      yy -= size + 6;
    } else {
      yy -= size * 0.5;
    }
  }
  return yy;
}

async function buildPdf(ctx: {
  opp: OppRow;
  generatedAt: Date;
}): Promise<Uint8Array> {
  const { opp, generatedAt } = ctx;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;

  const logoUrl =
    (Deno.env.get("PROPOSAL_LOGO_URL") ?? "").trim() ||
    `${(Deno.env.get("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "")}/vilo-logo.png`;

  try {
    const lr = await fetch(logoUrl);
    if (lr.ok) {
      const buf = new Uint8Array(await lr.arrayBuffer());
      let image;
      try {
        image = await doc.embedPng(buf);
      } catch {
        try {
          image = await doc.embedJpg(buf);
        } catch {
          image = null;
        }
      }
      if (image) {
        const scale = 0.12;
        const w = image.width * scale;
        const h = image.height * scale;
        page.drawImage(image, { x: 50, y: y - h, width: w, height: h });
        y -= h + 24;
      }
    }
  } catch {
    /* sin logo */
  }

  page.drawText("BORRADOR — Propuesta comercial", {
    x: 50,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.35),
  });
  y -= 28;

  const org = opp.organizations;
  const companyBlock = [
    `Organización CRM: ${org?.name ?? opp.company_name}`,
    org?.type ? `Tipo org.: ${org.type}` : "",
    org?.website ? `Web: ${org.website}` : "",
    `Contacto oportunidad: ${opp.contact_name ?? "—"} (${opp.email ?? "sin email"})`,
    `Prioridad CRM: ${opp.priority}`,
  ]
    .filter(Boolean)
    .join("\n");

  y = drawWrapped(page, companyBlock, 50, y, 490, font, 10, rgb(0.2, 0.2, 0.2));
  y -= 8;

  y = drawWrapped(
    page,
    `Oportunidad: ${opp.company_name}\n` +
      `Categoría comercial: ${commercialCategory(opp.opportunity_type)}\n` +
      `Tipo (enum): ${opp.opportunity_type ?? "—"}\n` +
      `Área terapéutica: ${opp.therapeutic_area ?? "—"}\n` +
      `Timeline / siguiente hito: ${opp.next_followup_date ?? "A coordinar con comercial"}`,
    50,
    y,
    490,
    font,
    10,
    rgb(0.15, 0.15, 0.15),
  );
  y -= 12;

  y = drawWrapped(page, templateIntro(opp.opportunity_type), 50, y, 490, font, 10, rgb(0.2, 0.2, 0.25));
  y -= 12;

  y = drawWrapped(page, milestoneText(opp.potential_value), 50, y, 490, font, 10, rgb(0.1, 0.35, 0.2));
  y -= 16;

  page.drawText(`Generado (UTC): ${generatedAt.toISOString()} — Uso interno Vilo`, {
    x: 50,
    y: Math.max(y, 72),
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  return doc.save();
}

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error: qErr } = await supabase
    .from("vilo_opportunities")
    .select(
      `
      id, org_id, company_name, contact_name, email, status, opportunity_type, therapeutic_area, priority, potential_value, notes, next_followup_date, created_at,
      organizations ( id, name, type, website, notes )
    `,
    )
    .eq("archived", false)
    .eq("status", "Negotiation")
    .is("proposal_pdf_path", null);

  if (qErr) {
    return new Response(JSON.stringify({ error: qErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const opps = (rows ?? []) as OppRow[];
  const results: { id: string; ok: boolean; path?: string; err?: string }[] = [];

  for (const opp of opps) {
    const generatedAt = new Date();
    const stamp = generatedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const keyPart = opp.org_id ?? opp.id;
    const path = `${keyPart}_${stamp}.pdf`;

    try {
      const pdfBytes = await buildPdf({ opp, generatedAt });
      const { error: upErr } = await supabase.storage.from("proposals").upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upErr) {
        results.push({ id: opp.id, ok: false, err: upErr.message });
        continue;
      }

      const { data: signed, error: signErr } = await supabase.storage
        .from("proposals")
        .createSignedUrl(path, 60 * 60 * 24 * 7);

      const linkLine = signErr || !signed?.signedUrl
        ? `Storage: proposals/${path}`
        : signed.signedUrl;

      const noteAppend =
        `\n\n---\n[Borrador proposal ${generatedAt.toISOString().slice(0, 10)}]\n${linkLine}\n`;

      const { error: updErr } = await supabase
        .from("vilo_opportunities")
        .update({
          proposal_pdf_path: path,
          proposal_pdf_generated_at: generatedAt.toISOString(),
          notes: (opp.notes ?? "") + noteAppend,
        })
        .eq("id", opp.id);

      if (updErr) {
        results.push({ id: opp.id, ok: false, err: updErr.message });
        continue;
      }

      const due = new Date(generatedAt.getTime() + 48 * 3600000).toISOString();
      await supabase.from("action_items").insert({
        business_unit: "vilo_research",
        record_type: "opportunity",
        record_id: opp.id,
        title: `Revisar proposal antes de enviar — ${opp.company_name}`,
        status: "pending",
        next_action: "Revisar PDF en Storage, ajustar pricing/legal y enviar al cliente",
        due_date: due,
        owner_id: null,
        priority: "high",
        value_usd: opp.potential_value ?? null,
        notes: `Archivo: proposals/${path}`,
        source: "agent:proposal:generator",
      });

      results.push({ id: opp.id, ok: true, path });
    } catch (e) {
      results.push({
        id: opp.id,
        ok: false,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      candidates: opps.length,
      results,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
