"use client";

import { cn } from "@/lib/cn";
import { isDateBeforeToday, isTaskOverdue } from "@/lib/dates";
import { useCrmStore } from "@/lib/store";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard", short: "Dash" },
  { href: "/vilo", label: "Vilo Pipeline", short: "Vilo" },
  { href: "/vitalis", label: "Vitalis Pipeline", short: "Vit" },
  { href: "/contacts", label: "Contacts", short: "Contacts" },
  { href: "/tasks", label: "Tasks", short: "Tasks" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useCrmStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useCrmStore((s) => s.toggleSidebar);
  const tasks = useCrmStore((s) => s.tasks);
  const vilo = useCrmStore((s) => s.viloOpportunities);
  const leads = useCrmStore((s) => s.patientLeads);

  const overdueTasks = tasks.filter((t) => isTaskOverdue(t.dueAt, t.completed)).length;
  const overdueVilo = vilo.filter(
    (o) => o.nextFollowupDate && isDateBeforeToday(o.nextFollowupDate) && o.status !== "Closed Lost"
  ).length;
  const overdueVitalis = leads.filter((l) => {
    if (!l.nextAction) return false;
    if (l.nextAction.includes("-")) return isDateBeforeToday(l.nextAction);
    return false;
  }).length;

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-clinical-line bg-white transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-[240px]"
      )}
    >
      <div className={cn("flex items-center gap-2 border-b border-clinical-line p-3", collapsed && "flex-col")}>
        <div className="min-w-0 flex-1">
          {!collapsed ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo Research Group</div>
              <div className="truncate text-sm font-semibold text-clinical-ink">CRM</div>
              <div className="text-[11px] text-clinical-muted">+ Vitalis</div>
            </>
          ) : (
            <div className="text-center text-[10px] font-bold leading-tight text-vilo-700">VRG</div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          className="rounded-lg border border-clinical-line p-2 text-clinical-muted hover:bg-vilo-50 hover:text-clinical-ink"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="text-lg leading-none">{collapsed ? "»" : "«"}</span>
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const showOverdue = item.href === "/tasks" && overdueTasks > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-vilo-100 text-vilo-900"
                  : "text-clinical-muted hover:bg-vilo-50 hover:text-clinical-ink",
                collapsed && "justify-center px-2"
              )}
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", active ? "bg-vilo-500" : "bg-clinical-line")} />
              {!collapsed ? item.label : item.short}
              {showOverdue && (
                <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-clinical-alert px-1.5 text-[11px] font-bold text-white">
                  {overdueTasks > 99 ? "99+" : overdueTasks}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (overdueVilo > 0 || overdueVitalis > 0) && (
        <div className="border-t border-clinical-line p-3 text-xs text-clinical-muted">
          <div className="font-semibold text-clinical-ink">Follow-ups</div>
          {overdueVilo > 0 && <div>Vilo overdue: {overdueVilo}</div>}
          {overdueVitalis > 0 && <div>Vitalis overdue: {overdueVitalis}</div>}
        </div>
      )}
    </aside>
  );
}
