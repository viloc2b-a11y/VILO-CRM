"use client";

import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

export interface UserProfile {
  id: string;
  full_name: string;
  role: "admin" | "bd" | "coordinator" | "viewer";
  active: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const sb = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileForUser(u: User | null) {
      if (!u) {
        setProfile(null);
        return;
      }
      const { data: p } = await sb.from("user_profiles").select("*").eq("id", u.id).single();
      if (!cancelled) setProfile(p as UserProfile | null);
    }

    async function init() {
      const {
        data: { user: u },
      } = await sb.auth.getUser();
      if (cancelled) return;
      setUser(u);
      await loadProfileForUser(u);
      if (!cancelled) setLoading(false);
    }

    void init();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      await loadProfileForUser(u);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [sb]);

  async function signOut() {
    await sb.auth.signOut();
    window.location.href = "/login";
  }

  const isAdmin = profile?.role === "admin";
  const isViloAccess = ["admin", "bd"].includes(profile?.role ?? "");
  const isVitalisAccess = ["admin", "coordinator"].includes(profile?.role ?? "");

  return { user, profile, loading, signOut, isAdmin, isViloAccess, isVitalisAccess };
}
