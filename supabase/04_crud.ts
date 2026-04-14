/**
 * VILO CRM — 04_crud.ts
 * Blueprint de implementación (NO copiar literalmente a producción).
 * Adaptar rutas, capas de datos y hooks a la estructura real del repo Next.js.
 *
 * Supabase: https://supabase.com/dashboard/project/ehxciiqxcolnqcohrbrx
 */

/** Orden sugerido de build (~10 días hábiles), una capa por bloque */
export const BUILD_ORDER_DAYS = [
  "Día 1: Variables de entorno + createBrowserClient / server client; login Supabase Auth (email mágico o password) solo staff.",
  "Día 2: Repositorio organizations — listar activos (archived=false), crear, actualizar, soft-archive (archived=true).",
  "Día 3: Repositorio contacts — CRUD con filtro por organization_id; joins opcionales a organizations.",
  "Día 4: vilo_opportunities — listas filtradas (status, priority, overdue usando v_vilo_overdue o filtro local); crear/editar.",
  "Día 5: patient_leads — mismos patrones; mapear UI strings libres a enums (gender, age_range, opportunity_type) con fallbacks.",
  "Día 6: tasks — insert con exactamente un FK (vilo_opportunity_id XOR patient_lead_id); completar vía status=completed (done_at por trigger).",
  "Día 7: Dashboard — una query a v_dashboard_metrics + tareas v_tasks_overdue para alertas.",
  "Día 8: Auto-task: al persistir status='Feasibility Sent' en vilo_opportunities, insertar task (channel vilo, due_at +3d, rule_key único) respetando índices únicos parciales.",
  "Día 9: Sincronizar Zustand → Supabase (reemplazar persist local) o capa híbrida durante transición.",
  "Día 10: QA móvil, índices revisados con EXPLAIN en queries lentas, backups / PITR verificados en panel Supabase.",
] as const;

/** CRUD por tabla — filtros reales sugeridos */
export const CRUD_BLUEPRINT = {
  organizations: {
    list: "SELECT * FROM organizations WHERE NOT archived ORDER BY name;",
    archive: "UPDATE organizations SET archived = true WHERE id = $1;",
  },
  contacts: {
    list: "SELECT * FROM contacts WHERE NOT archived AND org_id = $1 ORDER BY full_name;",
    archive: "UPDATE contacts SET archived = true WHERE id = $1;",
  },
  vilo_opportunities: {
    list: "SELECT * FROM v_vilo_active WHERE status = ANY($1); -- ordenar en app por priority + next_followup_date",
    overdue: "SELECT * FROM v_vilo_overdue;",
    archive: "UPDATE vilo_opportunities SET archived = true WHERE id = $1;",
  },
  patient_leads: {
    list: "SELECT * FROM v_vitalis_active WHERE current_stage = ANY($1);",
    archive: "UPDATE patient_leads SET archived = true WHERE id = $1;",
  },
  tasks: {
    openByChannel: "SELECT * FROM tasks WHERE NOT done AND channel = $1 ORDER BY due_date;",
    overdue: "SELECT * FROM v_tasks_overdue ORDER BY due_date;",
    complete: "UPDATE tasks SET done = true WHERE id = $1; -- done_at vía trigger BEFORE UPDATE",
    hardDelete: "DELETE FROM tasks WHERE id = $1;",
  },
} as const;

/**
 * Auto-task al pasar a Feasibility Sent (app/server, no en SQL obligatorio):
 * - Tras UPDATE exitoso de vilo_opportunities con status = 'Feasibility Sent'
 * - INSERT tasks (title, due_date = current_date+3, channel='vilo', linked_vilo_id=id)
 *   (añadir rule_key si más adelante añades índice único de dedupe en SQL)
 */
export const AUTO_TASK_FEASIBILITY_SENT = "feasibility_followup_3d" as const;

/** Validaciones a nivel app (mensajes claros para el usuario) */
export const APP_VALIDATION = [
  "patient_leads: si current_stage === 'Screen Fail', exigir screen_fail_reason (DB: chk_screen_fail_reason).",
  "tasks: no ambos linked_vilo_id y linked_vitalis_id; chk_task_channel_link alinea channel con lado Vitalis/Vilo.",
  "tasks: marcar done=true dispara done_at en trigger; reabrir con done=false limpia done_at.",
  "Mapear UI a enums (ej. preferred_language ES → 'Spanish'; age_range del formulario → age_range_value '45-54').",
  "Listas: WHERE NOT archived en tablas con soft archive; tasks se eliminan con DELETE.",
  "potential_value: numeric(12,2); validar >= 0 en cliente.",
] as const;

/**
 * Realtime (Postgres changes):
 * - Activar solo cuando haya 2+ operadores en vivo en la misma vista; de lo contrario polling cada 30–60s basta.
 * - Canales sugeridos: public:patient_leads (solo stage + id), public:tasks (open).
 * - Desactivar Realtime en tablas con alto volumen de escritura batch si no hay UI compartida en tiempo real.
 */
export const REALTIME_NOTES = [
  "Habilitar replication para tablas concretas en Database → Replication.",
  "Suscribirse desde el cliente solo después de auth(); desuscribir en unmount.",
  "No reemplazar el estado local completo en cada evento: aplicar patch por id.",
] as const;
