// ============================================================
//  VILO CRM — WhatsApp → Patient Lead Intake Flow
//  Deliverables 1–6 (copy, form spec, API, SQL, tasks, flow)
// ============================================================

/**
 * DELIVERABLE 1 — WhatsApp Message Scripts
 *
 * MESSAGE A — Initial auto-reply (send immediately on first contact)
 * Trigger: Saved Reply or Quick Reply in WhatsApp Business App
 *
 * [ES]
 * ¡Hola! 👋 Gracias por contactarnos.
 * Somos Vitalis, parte de Vilo Research Group en Houston.
 * Conectamos personas con estudios clínicos pagados y sin costo.
 *
 * ¿Nos puedes decir tu nombre y en qué condición de salud
 * estás interesado/a? (Ej: diabetes, hipertensión, artritis…)
 *
 * [EN]
 * Hi there! 👋 Thanks for reaching out.
 * We're Vitalis, part of Vilo Research Group in Houston.
 * We connect people with paid clinical research studies.
 *
 * Can you share your name and what health condition
 * you're interested in? (e.g. diabetes, high blood pressure…)
 *
 * ────────────────────────────────────────────────────────────
 * MESSAGE B — Follow-up with form link (after they reply)
 * Replace CAMPAIGN_NAME and host with your deployed URL.
 *
 * [ES]
 * ¡Perfecto, [Nombre]! 🙌
 * Para verificar si calificas para un estudio,
 * llena este formulario rápido — tarda menos de 1 minuto:
 *
 * 👉 https://YOUR_DOMAIN/intake?source=whatsapp&campaign=CAMPAIGN_NAME
 *
 * Nos comunicamos contigo en menos de 15 minutos. ✅
 *
 * [EN]
 * Perfect, [Name]! 🙌
 * To check if you qualify for a study,
 * fill out this quick form — takes under 1 minute:
 *
 * 👉 https://YOUR_DOMAIN/intake?source=whatsapp&campaign=CAMPAIGN_NAME
 *
 * We'll get back to you within 15 minutes. ✅
 *
 * Campaign examples: fb_dm_april, google_hbp, ig_ob_mar, referral, 60plus
 */

/**
 * DELIVERABLE 2 — Form structure
 *
 * Public page: `app/intake/page.tsx` (+ `components/intake/IntakeForm.tsx`)
 * URL params: `?source=whatsapp&campaign=YOUR_CAMPAIGN`
 *
 * Visible fields (mobile order): full_name*, phone*, age_range chips,
 * condition_or_study_interest, zip_code, preferred_language (Spanish | English).
 * Hidden in POST body: source_campaign, source_channel (from URL + defaults).
 *
 * Tally alternative: webhook POST to same `/api/patient_leads` with matching JSON keys.
 */

/**
 * DELIVERABLE 3 — API route
 * Implemented at: `app/api/patient_leads/route.ts`
 * Uses `SUPABASE_SERVICE_ROLE_KEY` via `lib/supabase/service-role.ts` (no patient session).
 */

/** DELIVERABLE 4 — Paste into Supabase SQL Editor to validate schema */
export const WHATSAPP_INTAKE_TEST_INSERT_SQL = `
INSERT INTO patient_leads (
  full_name,
  phone,
  email,
  preferred_language,
  age_range,
  gender,
  condition_or_study_interest,
  source_campaign,
  zip_code,
  preferred_contact_channel,
  current_stage,
  next_action,
  screen_fail_reason,
  last_contact_date,
  notes,
  archived
) VALUES (
  'Rosa Martinez',
  '832-555-1001',
  null,
  'Spanish',
  '45-54',
  null,
  'Type 2 Diabetes',
  'fb_dm_april',
  '77084',
  'WhatsApp',
  'New Lead',
  'Initial contact via WhatsApp',
  null,
  CURRENT_DATE,
  'Source channel: whatsapp',
  false
)
RETURNING id, full_name, current_stage, created_at;
`.trim();

/**
 * DELIVERABLE 5 — Task after lead
 * API creates task: title "Contact new lead — {name}", channel vitalis,
 * priority High, due_date = UTC date of submission, linked_vitalis_id = new lead id.
 * Failure is non-fatal; lead insert still returns success.
 */

/**
 * DELIVERABLE 6 — Flow (summary)
 *
 * WhatsApp DM → Message A → reply → Message B + /intake link → form POST
 * → `/api/patient_leads` → `patient_leads` + `tasks` → Vitalis "New Lead" in CRM.
 */
