"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const BG = "#080c14";
const SURF = "#0e1623";
const BDR = "#1c2d47";
const MUTED = "#94a3b8";
const TXT = "#e2e8f0";
const GRN = "#22c55e";
const RED = "#ef4444";
const AMB = "#f59e0b";
const BLU = "#38bdf8";

type Metrics = Record<string, number | null | undefined> | null;
type PipelineRow = { stage: string; count: number; pct_of_total: number };
type FailRow = { reason: string; count: number; pct: number };
type TaskRow = {
  id: string;
  title: string;
  channel: string;
  priority: string;
  due_date: string;
  days_overdue: number | null;
  vitalis_name: string | null;
  vitalis_phone: string | null;
  vilo_company: string | null;
};

type DashboardPayload = {
  metrics: Metrics;
  execution: Metrics;
  pipeline: PipelineRow[];
  tasks: TaskRow[];
  screen_fails: FailRow[];
};

type ReportPayload = {
  report: Record<string, unknown> | null;
  source_breakdown: { source: string; total: number; enrolled: number; enrollment_rate_pct: number }[];
  screen_fail_top3: FailRow[];
  sponsor_message: { en: string; es: string };
  generated_at: string;
};

function stageColor(stage: string): string {
  const m: Record<string, string> = {
    "New Lead": "#64748b",
    "Contact Attempted": "#818cf8",
    Responded: "#38bdf8",
    "Prescreen Started": "#a78bfa",
    Prequalified: "#34d399",
    Scheduled: "#22c55e",
    "No-show": RED,
    Enrolled: GRN,
    "Screen Fail": AMB,
    "Nurture / Future Study": "#475569",
  };
  return m[stage] ?? BLU;
}

function metricBorder(key: string, v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return BDR;
  const n = Number(v);
  if (key === "avg_hours_to_contact") return n <= 4 ? GRN : n <= 12 ? AMB : RED;
  if (key === "overdue_followups_count") return n > 0 ? RED : GRN;
  if (key === "no_show_rate_pct") return n <= 15 ? GRN : n <= 30 ? AMB : RED;
  if (key.endsWith("_pct") || key.endsWith("rate_pct")) return n >= 40 ? GRN : n >= 20 ? AMB : AMB;
  return BLU;
}

function StatCard({
  label,
  value,
  borderColor,
}: {
  label: string;
  value: string;
  borderColor: string;
}) {
  return (
    <div
      style={{
        background: SURF,
        border: `1px solid ${BDR}`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, color: TXT, letterSpacing: "-0.02em" }}>{value}</div>
      <div
        style={{
          marginTop: 6,
          fontSize: 10,
          fontWeight: 700,
          color: MUTED,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function SponsorDashboard() {
  const [tab, setTab] = useState<"ops" | "report">("ops");
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [rep, setRep] = useState<ReportPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [taskBusy, setTaskBusy] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [dRes, rRes] = await Promise.all([fetch("/api/dashboard", { cache: "no-store" }), fetch("/api/reports/sponsor", { cache: "no-store" })]);
      if (!dRes.ok) throw new Error(await dRes.text());
      if (!rRes.ok) throw new Error(await rRes.text());
      setDash(await dRes.json());
      setRep(await rRes.json());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const t = setInterval(() => {
      void fetchAll();
    }, 60_000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const m = dash?.metrics ?? null;
  const ex = dash?.execution ?? null;

  const pipelineMax = useMemo(() => Math.max(1, ...(dash?.pipeline ?? []).map((p) => p.count)), [dash?.pipeline]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy:", text);
    }
  };

  const toggleTask = async (id: string, done: boolean) => {
    setTaskBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
    } catch (e) {
      setErr(String(e));
    } finally {
      setTaskBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const fmt = (v: number | null | undefined, suffix = "") => {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return `${Number(v)}${suffix}`;
  };

  const wk = (rep?.report ?? {}) as Record<string, number | string | null | undefined>;

  return (
    <div style={{ minHeight: "100%", background: BG, color: TXT, fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px 48px" }}>
        {err && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${RED}`,
              background: "rgba(239,68,68,0.12)",
              color: "#fecaca",
              fontSize: 14,
            }}
          >
            {err}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Sponsor dashboard</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: MUTED }}>Enrollment engine, execution, pipeline, and sponsor-ready report.</p>
          </div>
          {loading && <span style={{ fontSize: 12, color: MUTED }}>Updating…</span>}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {(
            [
              ["ops", "Operations"],
              ["report", "Sponsor report"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${tab === id ? BLU : BDR}`,
                background: tab === id ? "rgba(56,189,248,0.12)" : SURF,
                color: tab === id ? BLU : MUTED,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "ops" && (
          <>
            <h2 style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>
              Enrollment engine (7d)
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: 12,
                marginBottom: 28,
              }}
            >
              <StatCard label="Total leads (7d)" value={fmt(m?.total_leads)} borderColor={metricBorder("total_leads", m?.total_leads)} />
              <StatCard
                label="Avg time to contact (h)"
                value={fmt(m?.avg_hours_to_contact)}
                borderColor={metricBorder("avg_hours_to_contact", m?.avg_hours_to_contact)}
              />
              <StatCard
                label="Prescreen rate %"
                value={fmt(m?.prescreen_rate_pct, "%")}
                borderColor={metricBorder("prescreen_rate_pct", m?.prescreen_rate_pct)}
              />
              <StatCard
                label="Eligible rate %"
                value={fmt(m?.eligible_rate_pct, "%")}
                borderColor={metricBorder("eligible_rate_pct", m?.eligible_rate_pct)}
              />
              <StatCard
                label="Enrollment rate %"
                value={fmt(m?.enrollment_rate_pct, "%")}
                borderColor={metricBorder("enrollment_rate_pct", m?.enrollment_rate_pct)}
              />
              <StatCard label="Show rate %" value={fmt(m?.show_rate_pct, "%")} borderColor={metricBorder("show_rate_pct", m?.show_rate_pct)} />
            </div>

            <h2 style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>
              Execution metrics
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: 12,
                marginBottom: 28,
              }}
            >
              <StatCard label="Scheduled this week" value={fmt(ex?.scheduled_this_week)} borderColor={BLU} />
              <StatCard label="Enrolled this month" value={fmt(ex?.enrolled_this_month)} borderColor={GRN} />
              <StatCard
                label="No-show rate %"
                value={fmt(ex?.no_show_rate_pct, "%")}
                borderColor={metricBorder("no_show_rate_pct", ex?.no_show_rate_pct)}
              />
              <StatCard
                label="Overdue follow-ups"
                value={fmt(ex?.overdue_followups_count)}
                borderColor={metricBorder("overdue_followups_count", ex?.overdue_followups_count)}
              />
            </div>

            <h2 style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>
              Pipeline by stage
            </h2>
            <div
              style={{
                background: SURF,
                border: `1px solid ${BDR}`,
                borderRadius: 12,
                padding: 16,
                marginBottom: 28,
              }}
            >
              {(dash?.pipeline ?? []).map((row) => (
                <div key={row.stage} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 140, flexShrink: 0, fontSize: 12, fontWeight: 600, color: TXT }}>{row.stage}</div>
                  <div style={{ flex: 1, height: 10, background: "#0f172a", borderRadius: 6, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${(row.count / pipelineMax) * 100}%`,
                        height: "100%",
                        background: stageColor(row.stage),
                        borderRadius: 6,
                        transition: "width .3s ease",
                      }}
                    />
                  </div>
                  <div style={{ width: 100, textAlign: "right", fontSize: 12, color: MUTED, flexShrink: 0 }}>
                    {row.count}{" "}
                    <span style={{ color: TXT }}>({fmt(row.pct_of_total, "%")})</span>
                  </div>
                </div>
              ))}
              {!dash?.pipeline?.length && <div style={{ color: MUTED, fontSize: 13 }}>No pipeline data.</div>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: 16 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, color: MUTED, textTransform: "uppercase" }}>Screen fail insights</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: MUTED, textAlign: "left" }}>
                      <th style={{ padding: "6px 4px" }}>#</th>
                      <th style={{ padding: "6px 4px" }}>Reason</th>
                      <th style={{ padding: "6px 4px" }}>Count</th>
                      <th style={{ padding: "6px 4px" }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dash?.screen_fails ?? []).map((r, i) => (
                      <tr key={r.reason + i} style={{ borderTop: `1px solid ${BDR}` }}>
                        <td style={{ padding: "8px 4px", color: MUTED }}>{i + 1}</td>
                        <td style={{ padding: "8px 4px" }}>{r.reason}</td>
                        <td style={{ padding: "8px 4px" }}>{r.count}</td>
                        <td style={{ padding: "8px 4px" }}>{fmt(r.pct, "%")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!dash?.screen_fails?.length && <div style={{ color: MUTED, fontSize: 13 }}>No screen fail rows.</div>}
              </div>

              <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: 16 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, color: MUTED, textTransform: "uppercase" }}>Task alerts</h3>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {(dash?.tasks ?? []).map((t) => {
                    const overdue = (t.days_overdue ?? 0) > 0;
                    const label = t.vitalis_name ?? t.vilo_company ?? "—";
                    const sub = t.vitalis_phone ? ` · ${t.vitalis_phone}` : "";
                    return (
                      <li
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: overdue ? "10px 10px" : "10px 0",
                          borderTop: `1px solid ${BDR}`,
                          borderRadius: overdue ? 8 : 0,
                          marginBottom: 4,
                          background: overdue ? "rgba(239,68,68,0.1)" : "transparent",
                          boxShadow: overdue ? `inset 3px 0 0 ${RED}` : "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          style={{ marginTop: 3 }}
                          disabled={Boolean(taskBusy[t.id])}
                          onChange={(e) => void toggleTask(t.id, e.target.checked)}
                          aria-label={`Mark done: ${t.title}`}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
                          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
                            {t.priority} · {t.channel} · due {t.due_date}
                            {overdue ? <span style={{ color: RED, fontWeight: 700 }}> · {t.days_overdue}d overdue</span> : null}
                          </div>
                          <div style={{ fontSize: 12, color: TXT, marginTop: 4 }}>
                            {label}
                            {sub}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!dash?.tasks?.length && <div style={{ color: MUTED, fontSize: 13 }}>No open tasks.</div>}
              </div>
            </div>
          </>
        )}

        {tab === "report" && rep && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                Weekly snapshot
              </h2>
              <a
                href="/api/reports/sponsor/pdf"
                download
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${BLU}`,
                  background: "rgba(56,189,248,0.12)",
                  color: BLU,
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Download PDF report
              </a>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <StatCard label="Leads this week" value={fmt(wk.leads_this_week as number)} borderColor={BLU} />
              <StatCard label="Enrolled" value={fmt(wk.enrolled_this_week as number)} borderColor={GRN} />
              <StatCard label="Enrollment rate %" value={fmt(wk.enrollment_rate_pct as number, "%")} borderColor={GRN} />
              <StatCard label="Conversion rate %" value={fmt(wk.conversion_rate_pct as number, "%")} borderColor={BLU} />
              <StatCard label="Avg hours to contact" value={fmt(wk.avg_hours_to_contact as number)} borderColor={metricBorder("avg_hours_to_contact", wk.avg_hours_to_contact as number)} />
            </div>

            <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800, color: MUTED, textTransform: "uppercase" }}>Top indication</h3>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{(wk.top_indication as string) ?? "—"}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{fmt(wk.top_indication_leads as number)} leads this week</div>
            </div>

            <h3 style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: "uppercase", margin: "0 0 12px" }}>Source breakdown (30d)</h3>
            <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: MUTED, textAlign: "left" }}>
                    <th style={{ padding: "6px 4px" }}>Source</th>
                    <th style={{ padding: "6px 4px" }}>Total</th>
                    <th style={{ padding: "6px 4px" }}>Enrolled</th>
                    <th style={{ padding: "6px 4px" }}>Rate</th>
                    <th style={{ padding: "6px 4px", width: 120 }}>Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {(rep.source_breakdown ?? []).map((s) => (
                    <tr key={s.source} style={{ borderTop: `1px solid ${BDR}` }}>
                      <td style={{ padding: "8px 4px" }}>{s.source}</td>
                      <td style={{ padding: "8px 4px" }}>{s.total}</td>
                      <td style={{ padding: "8px 4px" }}>{s.enrolled}</td>
                      <td style={{ padding: "8px 4px" }}>{fmt(s.enrollment_rate_pct, "%")}</td>
                      <td style={{ padding: "8px 4px" }}>
                        <div style={{ height: 8, background: "#0f172a", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, s.enrollment_rate_pct)}%`, height: "100%", background: GRN }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rep.source_breakdown?.length && <div style={{ color: MUTED, fontSize: 13 }}>No source data.</div>}
            </div>

            <div style={{ background: "rgba(56,189,248,0.08)", border: `1px solid ${BLU}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: BLU, textTransform: "uppercase" }}>Sponsor message</span>
                <button
                  type="button"
                  onClick={() => void copyText(rep.sponsor_message.en)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${BDR}`,
                    background: SURF,
                    color: TXT,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Copy EN
                </button>
                <button
                  type="button"
                  onClick={() => void copyText(rep.sponsor_message.es)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${BDR}`,
                    background: SURF,
                    color: TXT,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Copy ES
                </button>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.55, color: TXT }}>{rep.sponsor_message.en}</p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: MUTED }}>{rep.sponsor_message.es}</p>
              <div style={{ marginTop: 10, fontSize: 11, color: MUTED }}>Generated {new Date(rep.generated_at).toLocaleString()}</div>
            </div>
          </>
        )}

        {!dash && tab === "ops" && (
          <div style={{ color: MUTED, padding: 24, textAlign: "center" }}>Loading dashboard…</div>
        )}
      </div>
    </div>
  );
}
