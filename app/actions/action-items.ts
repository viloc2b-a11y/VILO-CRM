"use server";

import { createServerSideClient } from "@/lib/supabase/server";
import type { ActionItemPriority, ActionItemStatus } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

export type UpdateActionItemCommand = "complete" | "snooze_24h" | "snooze_7d" | "escalate";

const MS_DAY = 86400000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escalatePriority(current: ActionItemPriority): ActionItemPriority {
  const order: ActionItemPriority[] = ["low", "medium", "high", "critical"];
  const i = order.indexOf(current);
  if (i < 0) return "high";
  return order[Math.min(i + 1, order.length - 1)];
}

export async function updateActionItem(itemId: string, command: UpdateActionItemCommand) {
  const supabase = await createServerSideClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const updates: {
    updated_at: string;
    status?: ActionItemStatus;
    due_date?: string | null;
    priority?: ActionItemPriority;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (command === "complete") {
    updates.status = "completed";
  } else if (command === "snooze_24h") {
    updates.due_date = new Date(Date.now() + MS_DAY).toISOString();
  } else if (command === "snooze_7d") {
    updates.due_date = new Date(Date.now() + 7 * MS_DAY).toISOString();
  } else if (command === "escalate") {
    const { data: row, error: fetchErr } = await supabase
      .from("action_items")
      .select("priority")
      .eq("id", itemId)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);

    const current = (row?.priority as ActionItemPriority | undefined) ?? "medium";
    updates.priority = escalatePriority(current);
  }

  const { error } = await supabase.from("action_items").update(updates).eq("id", itemId);

  if (error) throw new Error(error.message);

  revalidatePath("/action-center");
  return { success: true as const };
}

/**
 * Asigna o quita delegado (`assigned_to`). Respeta RLS en `action_items` (12_*).
 * Pasá `null` o string vacío para limpiar la asignación.
 */
export async function reassignTask(itemId: string, newUserId: string | null) {
  if (!UUID_RE.test(itemId)) {
    throw new Error("Identificador de ítem inválido");
  }
  if (newUserId !== null && newUserId !== "" && !UUID_RE.test(newUserId)) {
    throw new Error("Identificador de usuario inválido");
  }

  const supabase = await createServerSideClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const assigned_to = newUserId && newUserId.length > 0 ? newUserId : null;

  const { error } = await supabase
    .from("action_items")
    .update({
      assigned_to,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) throw new Error(error.message);

  revalidatePath("/action-center");
  return { success: true as const };
}
