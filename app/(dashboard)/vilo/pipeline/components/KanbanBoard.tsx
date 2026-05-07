"use client";

import { createClient } from "@/lib/supabase/client";
import { VILO_STAGES, type ViloStage } from "@/lib/constants";
import { viloStageAppToDb } from "@/lib/supabase/mappers";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useState } from "react";

/**
 * Column labels aligned to your sketch; each maps to a single CRM `status` (Vilo stage).
 * "Budget negotiation" + "Contracting" share **Budget / CTA** in the CRM UI.
 */
const STAGE_COLUMNS: { label: string; stage: ViloStage }[] = [
  { label: "Lead identified", stage: "Lead Identified" },
  { label: "Contacted", stage: "Outreach Sent" },
  { label: "Responded", stage: "Response Received" },
  { label: "Intro call", stage: "Intro Call Pending" },
  { label: "Feasibility sent", stage: "Feasibility Sent" },
  { label: "Budget / CTA", stage: "Budget / CTA" },
  { label: "Startup", stage: "Startup" },
  { label: "Active study", stage: "Active Study" },
];

const TERMINAL_STAGES = new Set<ViloStage>(["Closed Won", "Closed Lost"]);

/** Short labels for the native `<select>` (unique `value` = `ViloStage`). */
const STAGE_OPTION_LABEL: Partial<Record<ViloStage, string>> = {
  "Lead Identified": "Lead identified",
  "Outreach Sent": "Contacted",
  "Response Received": "Responded",
  "Intro Call Pending": "Intro call",
  "Feasibility Sent": "Feasibility sent",
  "Budget / CTA": "Budget / CTA",
  Startup: "Startup",
  "Active Study": "Active study",
  "Closed Won": "Won",
  "Closed Lost": "Lost",
};

export type PipelineKanbanOpp = {
  id: string;
  company_name: string;
  organization_type: string | null;
  opportunity_type: string | null;
  status: ViloStage;
  potential_value: number | null;
  expected_close_date: string | null;
  /** Proxy for “probability” in the UI — B2B score; not a statistical win rate. */
  relationship_strength: number | null;
};

export type KanbanBoardProps = {
  initialOpportunities: PipelineKanbanOpp[];
};

export function KanbanBoard({ initialOpportunities }: KanbanBoardProps) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [movingId, setMovingId] = useState<string | null>(null);
  const supabase = createClient();

  async function handleStageChange(oppId: string, newStage: ViloStage) {
    setMovingId(oppId);
    try {
      const dbStatus = viloStageAppToDb(newStage);
      const { error } = await supabase.from("vilo_opportunities").update({ status: dbStatus }).eq("id", oppId);
      if (error) {
        window.alert(error.message);
        return;
      }
      if (TERMINAL_STAGES.has(newStage)) {
        setOpportunities((prev) => prev.filter((o) => o.id !== oppId));
      } else {
        setOpportunities((prev) => prev.map((o) => (o.id === oppId ? { ...o, status: newStage } : o)));
      }
    } finally {
      setMovingId(null);
    }
  }

  return (
    <>
      <div className="mb-4 text-sm text-clinical-muted">
        Stages use CRM enums under the hood.{" "}
        <Link href="/vilo" className="font-medium text-vilo-700 underline-offset-2 hover:underline">
          Full pipeline
        </Link>
        .
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGE_COLUMNS.map(({ label, stage }) => {
          const stageOpps = opportunities.filter((o) => o.status === stage);
          const stageValue = stageOpps.reduce((sum, o) => sum + (o.potential_value || 0), 0);

          return (
            <div
              key={label}
              className="min-w-[280px] shrink-0 rounded-lg border border-clinical-line bg-clinical-paper p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) void handleStageChange(id, stage);
              }}
            >
              <div className="mb-3 flex items-center justify-between border-b border-clinical-line pb-2">
                <h3 className="text-sm font-semibold text-clinical-ink">{label}</h3>
                <span className="rounded-full bg-vilo-100 px-2 py-0.5 text-xs text-vilo-900">
                  {stageOpps.length} | ${stageValue.toLocaleString()}
                </span>
              </div>
              <div className="space-y-2">
                {stageOpps.map((opp) => (
                  <div
                    key={opp.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", opp.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={cn(
                      "cursor-grab rounded-lg border border-clinical-line bg-white p-3 shadow-card transition hover:shadow-md active:cursor-grabbing",
                      movingId === opp.id && "opacity-50",
                    )}
                  >
                    <div className="truncate text-sm font-medium text-clinical-ink">
                      {opp.company_name || "Sin organización"}
                    </div>
                    {opp.organization_type && (
                      <div className="truncate text-xs text-clinical-muted">{opp.organization_type}</div>
                    )}
                    <div className="mt-1 text-xs text-clinical-muted">
                      {opp.opportunity_type || "Add type"} · Rel. {opp.relationship_strength ?? "No score"}
                    </div>
                    <div className="mt-1 font-mono text-xs text-clinical-ink">
                      ${(opp.potential_value || 0).toLocaleString()}
                    </div>
                    {opp.expected_close_date && (
                      <div className="mt-1 text-xs text-clinical-alert">
                        {new Date(opp.expected_close_date).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </div>
                    )}
                    <select
                      className="mt-2 w-full rounded border border-clinical-line bg-clinical-paper p-1 text-xs text-clinical-ink"
                      value={opp.status}
                      onChange={(e) => void handleStageChange(opp.id, e.target.value as ViloStage)}
                    >
                      {VILO_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_OPTION_LABEL[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
