/** YYYY-MM-DD local */
export function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isDateBeforeToday(dateStr: string): boolean {
  if (!dateStr) return false;
  const t = todayISODate();
  return dateStr < t;
}

export function isTaskOverdue(dueAtISO: string, completed: boolean): boolean {
  if (completed || !dueAtISO) return false;
  return new Date(dueAtISO).getTime() < Date.now();
}

export function startOfWeekMonday(d = new Date()): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function endOfWeekSunday(start: Date): Date {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function isTimestampInWeek(ts: string, weekStart: Date, weekEnd: Date): boolean {
  const t = new Date(ts).getTime();
  return t >= weekStart.getTime() && t <= weekEnd.getTime();
}

export function isDateInCurrentMonth(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = parseISODate(dateStr);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}

export function isTimestampInCurrentMonth(ts: string): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}
