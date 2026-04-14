"use client";

import { createClient } from "@/lib/supabase/client";
import { useMemo } from "react";
import { useAuth } from "./useAuth";

export type ActionType =
  | "lead_created"
  | "lead_updated"
  | "lead_stage_changed"
  | "lead_deleted"
  | "opportunity_created"
  | "opportunity_updated"
  | "opportunity_stage_changed"
  | "task_created"
  | "task_completed"
  | "task_deleted"
  | "contact_created"
  | "contact_updated"
  | "organization_created";

export function useActivityLog() {
  const { user, profile } = useAuth();
  const sb = useMemo(() => createClient(), []);

  async function log(params: {
    action: ActionType;
    entity_type: "patient_lead" | "vilo_opportunity" | "task" | "contact" | "organization";
    entity_id?: string;
    entity_label?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!user || !profile) return;
    await sb.from("activity_log").insert({
      user_id: user.id,
      user_name: profile.full_name,
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      entity_label: params.entity_label ?? null,
      metadata: params.metadata ?? null,
    });
  }

  return { log };
}
