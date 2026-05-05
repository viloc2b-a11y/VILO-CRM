#Requires -Version 5.1
<#
  Aplica el esquema VILO CRM en orden sobre Postgres (Supabase).

  1) Supabase Dashboard → Project Settings → Database → Connection string → URI
     (modo "Session" o "Transaction"; necesitás la contraseña de la DB).

  2) En PowerShell (desde la raíz del repo o cualquier cwd):

       $env:DATABASE_URL = "postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres"
       .\supabase\apply-schema.ps1

  Alternativa: tenés psql en PATH y pasás el mismo URI que usa el SQL Editor vía pooler.

  Opcional — backfill de action_items en DB con datos ya existentes (no en proyecto vacío):

       .\supabase\apply-schema.ps1 -IncludeBackfill

  No commitees DATABASE_URL ni contraseñas.
#>
param(
  [switch] $IncludeBackfill
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

$ordered = @(
  "01_schema.sql",
  "02_rls.sql",
  "03_sponsor_dashboard.sql",
  "05_auth_rbac_activity.sql",
  "06_action_center_studies_ctms.sql",
  "07_v_action_center_scale.sql",
  "08_sync_action_items_crm.sql",
  "10_v_action_metrics.sql",
  "11_user_profile_signup_and_self_update.sql",
  "12_action_items_assigned_to_rls.sql",
  "13_team_members_rpc.sql",
  "14_storage_backups_bucket.sql",
  "38_vilo_b2b_forecast.sql",
  "35_sponsor_report_kpis.sql",
  "15_nurture_agent.sql",
  "16_proposal_agent.sql",
  "17_vitalis_intake.sql",
  "18_qualifier_agent.sql",
  "19_vitalis_scheduler.sql",
  "20_hazlo_submissions_validator.sql",
  "21_hazlo_payment_recovery.sql",
  "22_hazlo_growth_agent.sql",
  "23_orchestrator_agent.sql",
  "24_triage_agent.sql",
  "25_agent_control.sql",
  "26_webhook_events.sql",
  "27_hazlo_square.sql",
  "28_webhook_events_register_fn.sql",
  "29_webhook_events_admin_rls.sql",
  "30_hazlo_square_extras_and_metrics.sql",
  "31_hazlo_validator_sql_support.sql",
  "32_campaign_roi_metrics.sql",
  "33_campaign_roi_utm_join.sql",
  "34_whatsapp_inbound_messages.sql",
  "36_notification_deliveries.sql",
  "37_notifications_log.sql",
  "39_communications_log.sql",
  "40_vitalis_b2c_consent_funnel.sql",
  "41_communications_log_patient_lead.sql",
  "42_communications_log_submission.sql"
)

if ($IncludeBackfill) {
  $ordered += "09_backfill_action_items.sql"
}

$db = $env:DATABASE_URL
if ([string]::IsNullOrWhiteSpace($db)) {
  Write-Error "Definí DATABASE_URL con la URI Postgres de Supabase (Settings → Database)."
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  Write-Error "No se encontró `psql` en PATH. Instalá PostgreSQL client tools o usá Supabase SQL Editor pegando cada archivo en orden (ver lista en este script)."
}

foreach ($name in $ordered) {
  $path = Join-Path $here $name
  if (-not (Test-Path $path)) {
    Write-Error "Falta el archivo: $path"
  }
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  & psql $db -v ON_ERROR_STOP=1 -f $path
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Falló $name (código $LASTEXITCODE)."
  }
}

Write-Host "`nListo. Creá un usuario en Auth y ejecutá el UPDATE de admin de INTEGRATION.md si hace falta." -ForegroundColor Green
