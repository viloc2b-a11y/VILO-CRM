"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

const COPY = {
  es: {
    title: "Registro Rápido",
    subtitle: "Verifica si calificas para un estudio clínico pagado",
    name: "Nombre completo",
    namePh: "Rosa Martinez",
    phone: "WhatsApp (con código de área)",
    phonePh: "(832) 555-0000",
    age: "Rango de edad",
    condition: "¿Qué condición de salud te interesa?",
    condPh: "ej. diabetes, presión alta, artritis…",
    zip: "Código postal",
    lang: "Idioma preferido",
    opts: [
      ["Spanish", "Español"],
      ["English", "English"],
    ] as const,
    submit: "Enviar →",
    sending: "Enviando…",
    success: "¡Listo! Te contactamos en menos de 15 minutos. ✅",
    err: "Algo salió mal. Inténtalo de nuevo.",
    req: "* Campos requeridos",
    newReg: "← Nuevo registro",
  },
  en: {
    title: "Quick Registration",
    subtitle: "Check if you qualify for a paid clinical study",
    name: "Full name",
    namePh: "Rosa Martinez",
    phone: "WhatsApp number",
    phonePh: "(832) 555-0000",
    age: "Age range",
    condition: "What health condition are you interested in?",
    condPh: "e.g. diabetes, high blood pressure, arthritis…",
    zip: "Zip code",
    lang: "Preferred language",
    opts: [
      ["Spanish", "Español"],
      ["English", "English"],
    ] as const,
    submit: "Submit →",
    sending: "Sending…",
    success: "You're registered! We'll contact you within 15 minutes. ✅",
    err: "Something went wrong. Please try again.",
    req: "* Required fields",
    newReg: "← New registration",
  },
} as const;

const AGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;

const BLUE = "#2d7ff9";
const DARK = "#0f172a";
const MID = "#64748b";
const BDR = "#e2e8f0";
const SURF = "#f8fafc";
const ERR = "#dc2626";
const GRN = "#16a34a";

export function IntakeForm() {
  const searchParams = useSearchParams();
  const sourceCampaign = useMemo(() => searchParams.get("campaign") ?? "", [searchParams]);
  const sourceChannel = useMemo(() => searchParams.get("source") ?? "whatsapp", [searchParams]);

  const [lang, setLang] = useState<"es" | "en">("es");
  const T = COPY[lang];

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    age_range: "" as string,
    condition_or_study_interest: "",
    zip_code: "",
    preferred_language: "Spanish" as "Spanish" | "English",
  });
  const [touched, setTouch] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const touch = (k: string) => setTouch((t) => ({ ...t, [k]: true }));

  const errors = {
    full_name: !form.full_name.trim() ? (lang === "es" ? "Requerido" : "Required") : "",
    phone: !form.phone.trim() ? (lang === "es" ? "Requerido" : "Required") : "",
  };

  const submit = async () => {
    setTouch({ full_name: true, phone: true });
    if (!form.full_name.trim() || !form.phone.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/patient_leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          source_campaign: sourceCampaign || undefined,
          source_channel: sourceChannel || "whatsapp",
        }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  const inp = (hasErr: boolean) =>
    ({
      width: "100%",
      padding: "11px 13px",
      border: `1.5px solid ${hasErr ? ERR : BDR}`,
      borderRadius: 8,
      fontSize: 15,
      color: DARK,
      outline: "none",
      boxSizing: "border-box",
      background: SURF,
      fontFamily: "inherit",
      transition: "border-color .15s",
    }) as const;

  const lbl = (hasErr: boolean) =>
    ({
      display: "block",
      fontSize: 11,
      fontWeight: 700,
      color: hasErr ? ERR : MID,
      textTransform: "uppercase",
      letterSpacing: "0.6px",
      marginBottom: 5,
    }) as const;

  const reset = () => {
    setStatus("idle");
    setForm({
      full_name: "",
      phone: "",
      age_range: "",
      condition_or_study_interest: "",
      zip_code: "",
      preferred_language: "Spanish",
    });
    setTouch({});
  };

  if (status === "success") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: SURF,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: "40px 28px",
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
            boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: GRN, lineHeight: 1.5 }}>{T.success}</div>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "10px 20px",
              background: "transparent",
              border: `1.5px solid ${BDR}`,
              borderRadius: 8,
              color: MID,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {T.newReg}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: SURF,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "20px 16px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "28px 24px",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20, gap: 6 }}>
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              style={{
                padding: "4px 12px",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 20,
                border: `1.5px solid ${lang === l ? DARK : BDR}`,
                cursor: "pointer",
                background: lang === l ? DARK : "transparent",
                color: lang === l ? "#fff" : MID,
                fontFamily: "inherit",
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <div
          style={{
            width: 44,
            height: 44,
            background: `linear-gradient(135deg,${BLUE},#6366f1)`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 900,
            fontSize: 18,
            marginBottom: 16,
          }}
        >
          V
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: DARK, marginBottom: 5, lineHeight: 1.2 }}>{T.title}</div>
        <div style={{ fontSize: 13, color: MID, marginBottom: 24, lineHeight: 1.5 }}>{T.subtitle}</div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl(Boolean(touched.full_name && errors.full_name))}>
            {T.name} <span style={{ color: ERR }}>*</span>
          </label>
          <input
            style={inp(Boolean(touched.full_name && errors.full_name))}
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            onBlur={() => touch("full_name")}
            placeholder={T.namePh}
            autoComplete="name"
          />
          {touched.full_name && errors.full_name ? (
            <div style={{ fontSize: 11, color: ERR, marginTop: 3 }}>{errors.full_name}</div>
          ) : null}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl(Boolean(touched.phone && errors.phone))}>
            {T.phone} <span style={{ color: ERR }}>*</span>
          </label>
          <input
            style={inp(Boolean(touched.phone && errors.phone))}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            onBlur={() => touch("phone")}
            type="tel"
            placeholder={T.phonePh}
            autoComplete="tel"
          />
          {touched.phone && errors.phone ? (
            <div style={{ fontSize: 11, color: ERR, marginTop: 3 }}>{errors.phone}</div>
          ) : null}
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={lbl(false)}>{T.age}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {AGES.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => set("age_range", a)}
                style={{
                  padding: "8px 12px",
                  border: `1.5px solid ${form.age_range === a ? BLUE : BDR}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: form.age_range === a ? BLUE : MID,
                  background: form.age_range === a ? "#eff6ff" : SURF,
                  transition: "all .15s",
                  fontFamily: "inherit",
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl(false)}>{T.condition}</label>
          <input
            style={inp(false)}
            value={form.condition_or_study_interest}
            onChange={(e) => set("condition_or_study_interest", e.target.value)}
            placeholder={T.condPh}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl(false)}>{T.zip}</label>
          <input
            style={inp(false)}
            value={form.zip_code}
            onChange={(e) => set("zip_code", e.target.value)}
            placeholder="77084"
            inputMode="numeric"
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <span style={lbl(false)}>{T.lang}</span>
          <div style={{ display: "flex", gap: 10 }}>
            {T.opts.map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => set("preferred_language", val)}
                style={{
                  flex: 1,
                  padding: "11px",
                  border: `1.5px solid ${form.preferred_language === val ? BLUE : BDR}`,
                  borderRadius: 8,
                  textAlign: "center",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  color: form.preferred_language === val ? BLUE : MID,
                  background: form.preferred_language === val ? "#eff6ff" : SURF,
                  transition: "all .15s",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {status === "error" ? (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: "10px 13px",
              marginBottom: 12,
              fontSize: 13,
              color: ERR,
            }}
          >
            {T.err}
          </div>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={status === "sending"}
          style={{
            width: "100%",
            padding: "14px",
            background: status === "sending" ? "#93c5fd" : BLUE,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 800,
            cursor: status === "sending" ? "not-allowed" : "pointer",
            letterSpacing: "-0.2px",
            fontFamily: "inherit",
            transition: "background .2s",
          }}
        >
          {status === "sending" ? T.sending : T.submit}
        </button>

        <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: "#cbd5e1" }}>{T.req}</div>

        <div
          style={{
            marginTop: 18,
            padding: "10px 12px",
            background: SURF,
            borderRadius: 8,
            border: `1px dashed ${BDR}`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 5,
            }}
          >
            Hidden fields (from URL ?params)
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace, ui-monospace, sans-serif" }}>
            source_campaign = <span style={{ color: BLUE }}>{sourceCampaign || "—"}</span>
            <br />
            source_channel = <span style={{ color: BLUE }}>{sourceChannel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
