import type { ActionItem } from "@/lib/supabase/types";

/** `action_items.source`: distingue tareas generadas por agentes vs manuales. */
export function isAgentOriginatedActionItem(source: string | null | undefined): boolean {
  if (source == null || source === "" || source === "manual") return false;
  return true;
}

/** UTC midnight for the given instant’s calendar day. */
export function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/** End of day, `days` after `start`’s calendar date (inclusive window for “next N days”). */
export function endOfUtcDayAfter(start: Date, days: number): Date {
  const t = new Date(start);
  t.setUTCDate(t.getUTCDate() + days);
  t.setUTCHours(23, 59, 59, 999);
  return t;
}

export function isActionItemOverdue(row: Pick<ActionItem, "due_date" | "status">, now = new Date()): boolean {
  if (row.status !== "pending" && row.status !== "in_progress") return false;
  if (!row.due_date) return false;
  return new Date(row.due_date).getTime() < startOfUtcDay(now).getTime();
}

/** Overdue, no due date, or due within [today .. today+7d] in UTC. */
export function isActionInFocusWindow(
  row: Pick<ActionItem, "due_date">,
  start: Date,
  windowEnd: Date
): boolean {
  if (!row.due_date) return true;
  const t = new Date(row.due_date).getTime();
  if (t < start.getTime()) return true;
  return t <= windowEnd.getTime();
}

export function sortActionItemsForDisplay(rows: ActionItem[]): ActionItem[] {
  return [...rows].sort((a, b) => {
    const aOver = isActionItemOverdue(a);
    const bOver = isActionItemOverdue(b);
    if (aOver !== bOver) return aOver ? -1 : 1;
    const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}
