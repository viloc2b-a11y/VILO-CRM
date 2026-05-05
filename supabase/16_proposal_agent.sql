-- ============================================================
--  VILO CRM — Proposal Agent (PDF en Storage + metadata en oportunidad)
--  Run after 01 (vilo_opportunities). Etapa disparadora en CRM: Negotiation
--  (equiv. "Budget negotiation" del brief).
-- ============================================================

ALTER TABLE public.vilo_opportunities
  ADD COLUMN IF NOT EXISTS proposal_pdf_path text,
  ADD COLUMN IF NOT EXISTS proposal_pdf_generated_at timestamptz;

COMMENT ON COLUMN public.vilo_opportunities.proposal_pdf_path IS
  'Ruta en bucket Storage `proposals` (ej. {org_id}_{timestamp}.pdf).';
COMMENT ON COLUMN public.vilo_opportunities.proposal_pdf_generated_at IS
  'Última generación automática de borrador (Edge Function proposal-agent).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('proposals', 'proposals', false, 52428800, ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO NOTHING;
