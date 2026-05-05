"use server";

import {
  reassignTask as reassignTaskAction,
  updateActionItem as updateActionItemAction,
} from "@/app/actions/action-items";

type UpdateActionItemCommand = "complete" | "snooze_24h" | "snooze_7d" | "escalate";

export async function updateActionItem(itemId: string, command: UpdateActionItemCommand) {
  return updateActionItemAction(itemId, command);
}

export async function reassignTask(itemId: string, newUserId: string | null) {
  return reassignTaskAction(itemId, newUserId);
}
