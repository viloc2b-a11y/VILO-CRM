# CRM Project Reference

This project is guided by the annexes in `C:\Users\jmend\Downloads`:

- `Análisis del Proyecto_ CRM Operativo Personalizado`
- `Análisis_del_Proyecto_CRM_Operativo_Personalizado.pdf`
- `Guía Completa_ CRM y Sistemas de Gestión para Estudios Clínicos en EE. UU..md`

## Product Positioning

Vilo CRM is an internal execution and revenue layer for clinical research operations. It should not become a generic Salesforce clone. The highest-value surface is the Action Center: what needs to happen today to move revenue, patients, studies, specimens, or partnerships.

## System Split

The annexes separate two product needs:

- CTMS-lite: studies, sites, visits, monitoring, deviations, payments, invoices, specimens, shipments, sponsor reporting.
- Patient recruitment CRM: campaigns, patient leads, speed-to-lead, pre-screening, scheduling, retention.

HazloAsíYa remains a separate consumer funnel and payments workflow. Do not move its Cloudflare Pages Functions into `app/api`.

## MVP Priorities

1. Keep CRUD simple and fast.
2. Prioritize Action Center over dashboards.
3. Add automation only where it removes manual work:
   - Intake Agent
   - Scheduler Agent
   - Orchestrator Agent
   - Validator / Recovery agents for Hazlo
4. Use rule-based heuristics before ML.
5. Track revenue leakage:
   - overdue invoices
   - pass-through costs
   - margin per study
   - sponsor pipeline value

## Compliance Guardrails

For HIPAA and 21 CFR Part 11 readiness:

- RLS is mandatory for clinical tables.
- Service-role access stays server-side only.
- PHI fields should be encrypted or minimized where practical.
- Every agent action should create an execution/audit record.
- Consent to contact must be recorded before automated outreach.
- Clinical integrations should assume future EDC/eTMF interoperability.

## Design Guardrails

- Dense administrative UI.
- Tables, queues, filters, and inline actions beat marketing layouts.
- No decorative landing pages for internal CRM workflows.
- Use clear modules:
  - Vilo Research
  - Vitalis
  - HazloAsíYa
  - Studies / CTMS
  - Financials
  - Biospecimens
  - Action Center
