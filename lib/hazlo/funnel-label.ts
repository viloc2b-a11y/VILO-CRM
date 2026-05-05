/** Etiqueta corta para plantillas WhatsApp / copy Hazlo. */
export function funnelTypeShortLabel(funnelType: string | null | undefined): string {
  const ft = (funnelType ?? "").trim();
  if (ft === "snap_medicaid") return "SNAP Medicaid";
  if (ft === "daca_itin") return "DACA / ITIN";
  if (!ft) return "tu trámite";
  return ft.replace(/_/g, " ");
}
