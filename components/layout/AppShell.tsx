"use client";

import { useHydrated } from "@/hooks/useHydrated";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();

  return (
    <div className="flex min-h-screen bg-clinical-paper text-clinical-ink">
      <Sidebar />
      <main className="min-w-0 flex-1">
        {!hydrated ? (
          <div className="flex h-24 items-center justify-center text-sm text-clinical-muted">Loading…</div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
