"use client";

import { createClient } from "@/lib/supabase/client";
import type { BuEnum } from "@/lib/supabase/types";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const BU_OPTIONS: { value: BuEnum; label: string }[] = [
  { value: "vilo_research", label: "Vilo Research" },
  { value: "vitalis", label: "Vitalis" },
  { value: "hazloasiya", label: "HazloAsíYa" },
];

export default function OnboardingPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [bu, setBu] = useState<BuEnum>("vilo_research");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    const { data, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name.trim(),
          business_unit: bu,
        },
      },
    });
    setLoading(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    if (data.session) {
      setInfo("Cuenta creada. Entrando…");
      window.location.assign("/action-center");
      return;
    }
    setInfo(
      "Cuenta creada. Revisá tu correo para confirmar (o desactivá la confirmación en Supabase → Authentication → Providers → Email)."
    );
    router.push("/login?redirectTo=/action-center");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center rounded-2xl bg-[#0d1b35] p-4">
            <Image
              src="/vilo-logo.png"
              alt="Vilo Research Group"
              width={280}
              height={80}
              className="h-16 w-auto object-contain"
              priority
            />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Crear cuenta</h1>
          <p className="mt-1 text-sm text-gray-500">VILO CRM — elegí tu unidad de negocio principal</p>
        </div>

        <form onSubmit={(e) => void handleSignup(e)} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Nombre completo
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Nombre y apellido"
              autoComplete="name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="vos@ejemplo.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Contraseña
            </label>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Unidad de negocio
            </label>
            <select
              value={bu}
              onChange={(e) => setBu(e.target.value as BuEnum)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {BU_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</div>
          )}
          {info && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{info}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Creando…" : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
