"use client";

import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirectTo") || "/";
  const redirectTo =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/";
  const sb = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: signErr } = await sb.auth.signInWithPassword({ email, password });
    if (signErr) {
      setError(signErr.message);
      setLoading(false);
      return;
    }
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData.user) {
      setError(userErr?.message ?? "Could not start session. Try again or clear site cookies for this domain.");
      setLoading(false);
      return;
    }
    // Full navigation so middleware always receives auth cookies (router.push alone can race).
    window.location.assign(redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-clinical-paper p-4">
      <div className="w-full max-w-sm rounded-2xl border border-clinical-line bg-white p-8 shadow-card">
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
          <h1 className="text-xl font-bold text-clinical-ink">VILO CRM</h1>
          <p className="mt-1 text-sm text-clinical-muted">Sign in to your account</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinical-muted">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2.5 text-sm text-clinical-ink outline-none placeholder:text-clinical-muted/70 focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200"
              placeholder="you@vilohealth.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinical-muted">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2.5 text-sm text-clinical-ink outline-none placeholder:text-clinical-muted/70 focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-vilo-500 py-2.5 text-sm font-semibold text-[#06111f] transition hover:bg-vilo-400 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-clinical-paper text-sm text-clinical-muted">Loading…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
