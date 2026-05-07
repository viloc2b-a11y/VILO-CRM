"use client";

import { cn } from "@/lib/cn";
import { isDateBeforeToday, isTaskOverdue } from "@/lib/dates";
import { useAuth } from "@/hooks/useAuth";
import { useCrmStore } from "@/lib/store";
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckSquare,
  Contact,
  FlaskConical,
  HeartPulse,
  Home,
  Upload,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  ShieldCheck,
  Stethoscope,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard", short: "Dash", icon: Home },
  { href: "/action-center", label: "Action Center", short: "Act", icon: Activity },
  { href: "/dashboard/sponsor", label: "Sponsor", short: "Spo", icon: Building2 },
  { href: "/dashboard/ingestion", label: "Ingestion Center", short: "Ingest", icon: Upload },
  { href: "/analytics", label: "ROI & Campañas", short: "ROI", icon: BarChart3 },
  { href: "/vilo", label: "Vilo Pipeline", short: "Vilo", icon: BriefcaseBusiness },
  { href: "/vitalis", label: "Vitalis Pipeline", short: "Vit", icon: HeartPulse },
  { href: "/hazlo", label: "Hazlo Pipeline", short: "Hz", icon: WalletCards },
  { href: "/clinical-ops", label: "Clinical Ops", short: "Ops", icon: Stethoscope },
  { href: "/biospecimens", label: "Biospecimens", short: "Bio", icon: FlaskConical },
  { href: "/financials", label: "Financials", short: "Fin", icon: ReceiptText },
  { href: "/contacts", label: "Contacts", short: "Contacts", icon: Contact },
  { href: "/tasks", label: "Tasks", short: "Tasks", icon: CheckSquare },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut, isAdmin } = useAuth();
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
        "sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-clinical-line bg-white transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-[260px]"
      )}
    >
      <div className={cn("flex items-center gap-2 border-b border-clinical-line p-3", collapsed && "flex-col")}>
        <div className="min-w-0 flex-1">
          {!collapsed ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo Research Group</div>
              <div className="truncate text-sm font-semibold text-clinical-ink">Ops CRM</div>
              <div className="text-[11px] text-clinical-muted">Vilo · Vitalis · Hazlo</div>
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
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const showOverdue = item.href === "/tasks" && overdueTasks > 0;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-vilo-100 text-vilo-900"
                  : "text-clinical-muted hover:bg-vilo-50 hover:text-clinical-ink",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-vilo-700" : "text-clinical-muted")} />
              {!collapsed ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
              {showOverdue && !collapsed && (
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

      <div className="shrink-0 border-t border-clinical-line p-3">
        {profile && !collapsed && (
          <div className="mb-2 rounded-lg bg-clinical-paper px-3 py-2">
            <div className="truncate text-xs font-semibold text-clinical-ink">{profile.full_name}</div>
            <div className="text-[10px] uppercase tracking-wide text-clinical-muted">{profile.role}</div>
          </div>
        )}
        <div className={cn("flex gap-2", collapsed && "flex-col")}>
          {isAdmin && (
            <Link
              href="/admin"
              title="Admin"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-clinical-line bg-clinical-paper px-2 py-1.5 text-xs font-medium text-clinical-ink hover:bg-vilo-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {!collapsed ? "Admin" : <span className="sr-only">Admin</span>}
            </Link>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-clinical-line bg-clinical-paper px-2 py-1.5 text-xs font-medium text-clinical-muted hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            {!collapsed ? "Sign out" : <span className="sr-only">Sign out</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
