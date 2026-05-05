import type { GrowthOffer, GrowthSegment } from "@/lib/hazlo/growth/types";

const CATALOG: Record<GrowthSegment, GrowthOffer[]> = {
  snap: [
    {
      slug: "medicaid",
      headline: "Medicaid",
      body: "Ya aprobaste SNAP — muchos hogares califican también para Medicaid. Tus documentos de ingresos y domicilio suelen servir de nuevo.",
      etaMinutes: 5,
    },
    {
      slug: "wic",
      headline: "WIC",
      body: "Ya aprobaste SNAP — ¿sabías que muchas familias califican también para WIC? Podés completar en unos minutos; varios de tus documentos ya están listos en el sistema.",
      etaMinutes: 5,
    },
    {
      slug: "housing",
      headline: "programas de vivienda",
      body: "Hay ayudas de vivienda en tu estado que combinan bien con SNAP. Te mostramos opciones según tu perfil.",
      etaMinutes: 10,
    },
  ],
  itin: [
    {
      slug: "taxes",
      headline: "declaración de impuestos (ITIN)",
      body: "Con tu ITIN podés iniciar o ajustar tu estrategia fiscal. Muchos clientes lo resuelven en una sola sesión.",
      etaMinutes: 15,
    },
    {
      slug: "school_enrollment",
      headline: "inscripción escolar",
      body: "Si tenés hijos en edad escolar, podemos orientarte con inscripción y documentación usando lo que ya tenemos.",
      etaMinutes: 10,
    },
  ],
  daca: [
    {
      slug: "work_permit",
      headline: "permiso de trabajo",
      body: "Si renovaste o aprobaste DACA, el siguiente paso lógico es alinear tu permiso de trabajo. Revisamos tu expediente.",
      etaMinutes: 10,
    },
    {
      slug: "driver_license",
      headline: "licencia de conducir",
      body: "En varios estados podés tramitar licencia con tu situación actual. Te decimos requisitos y te ahorramos idas en vano.",
      etaMinutes: 15,
    },
  ],
};

function stableIndex(seed: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return modulo > 0 ? h % modulo : 0;
}

export function pickOfferForSegment(segment: GrowthSegment, submissionId: string): GrowthOffer {
  const list = CATALOG[segment];
  const idx = stableIndex(submissionId, list.length);
  return list[idx]!;
}
