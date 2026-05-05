/**
 * React-PDF document for sponsor/org reports. Import from Route Handlers via `pdf()`
 * from `@react-pdf/renderer` (no `'use client'` — keeps server generation working).
 */
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

import type { Database } from "@/types/database";

Font.register({
  family: "OpenSans",
  src: "https://fonts.gstatic.com/s/opensans/v36/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0B4gaVc.ttf",
});

export type SponsorReportKpis = {
  active_opportunities: number;
  pipeline_forecast: number;
  leads_in_pipeline: number;
  screened_scheduled: number;
  completed_visits: number;
  first_lead_date: string | null;
  last_activity_date: string | null;
};

/** Row shapes: `organizations` + `vilo_opportunities` (not legacy companies/opportunities). */
export type SponsorReportPDFData = {
  company: Database["public"]["Tables"]["organizations"]["Row"];
  kpis: SponsorReportKpis;
  opportunities: Database["public"]["Tables"]["vilo_opportunities"]["Row"][];
  generatedAt: string;
};

function formatMoneyEs(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatDateEs(iso: string | null): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString("es-ES");
}

function formatDateTimeEs(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es-ES");
}

function opportunityLabel(opp: SponsorReportPDFData["opportunities"][number]): string {
  const type = opp.opportunity_type;
  const base = opp.company_name?.trim() || "—";
  return type ? `${base} · ${type}` : base;
}

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 40,
    fontFamily: "OpenSans",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 24, fontWeight: "bold", color: "#111827" },
  subtitle: { fontSize: 12, color: "#6B7280", marginTop: 4 },
  orgName: { fontSize: 12, color: "#374151", marginTop: 12 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 12,
    padding: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
  },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: {
    width: "48%",
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  kpiValue: { fontSize: 22, fontWeight: "bold", color: "#059669" },
  kpiLabel: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 4,
    textTransform: "uppercase",
  },
  table: { width: "auto", borderWidth: 1, borderColor: "#E5E7EB" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  tableCellHeader: {
    flex: 1,
    padding: 8,
    backgroundColor: "#F3F4F6",
    fontSize: 10,
    fontWeight: "bold",
    color: "#374151",
  },
  tableCell: { flex: 1, padding: 8, fontSize: 10, color: "#4B5563" },
  timelineText: { fontSize: 10, color: "#4B5563" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#9CA3AF",
  },
});

export function SponsorReportPDF({
  company,
  kpis,
  opportunities,
  generatedAt,
}: SponsorReportPDFData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Reporte de Reclutamiento & Pipeline</Text>
            <Text style={styles.subtitle}>Generado automáticamente por ViloOS CRM</Text>
          </View>
          <Text style={styles.orgName}>{company.name}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Resumen ejecutivo</Text>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{kpis.leads_in_pipeline}</Text>
              <Text style={styles.kpiLabel}>Leads en pipeline</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{kpis.screened_scheduled}</Text>
              <Text style={styles.kpiLabel}>Screened / scheduled</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{kpis.completed_visits}</Text>
              <Text style={styles.kpiLabel}>Visitas completadas</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>${formatMoneyEs(kpis.pipeline_forecast)}</Text>
              <Text style={styles.kpiLabel}>Pipeline forecast</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧬 Oportunidades activas</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, { backgroundColor: "#F3F4F6" }]}>
              <Text style={[styles.tableCellHeader, { flex: 2 }]}>Proyecto / tipo</Text>
              <Text style={[styles.tableCellHeader, { flex: 1 }]}>Etapa</Text>
              <Text style={[styles.tableCellHeader, { flex: 1 }]}>Prioridad</Text>
              <Text style={[styles.tableCellHeader, { flex: 1, textAlign: "right" }]}>
                Valor est.
              </Text>
            </View>
            {opportunities.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1 }]}>Sin filas en esta vista.</Text>
              </View>
            ) : (
              opportunities.map((opp) => (
                <View key={opp.id} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{opportunityLabel(opp)}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{opp.status}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{opp.priority}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>
                    ${formatMoneyEs(opp.potential_value ?? 0)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Actividad</Text>
          <Text style={styles.timelineText}>
            Primer contacto: {formatDateEs(kpis.first_lead_date)} | Última actualización:{" "}
            {formatDateEs(kpis.last_activity_date)}
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>© {new Date().getFullYear()} Vilo Research Group</Text>
          <Text>Documento confidencial | Generado: {formatDateTimeEs(generatedAt)}</Text>
          <Text>Página 1 de 1</Text>
        </View>
      </Page>
    </Document>
  );
}
