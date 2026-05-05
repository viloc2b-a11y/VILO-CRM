"use client";

import { createClient } from "@/lib/supabase/client";
import type { BuEnum } from "@/lib/supabase/types";
import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

export interface UserProfile {
  id: string;
  full_name: string;
  role: "admin" | "bd" | "coordinator" | "viewer";
  active: boolean;
  /** Present after `06_action_center_studies_ctms.sql`; defaults to Vilo+Vitalis in RLS helpers. */
  allowed_business_units?: BuEnum[];
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const sb = useMemo(() => createClient(), []);

  useEffect(() => {
    // Get initial session
    void sb.auth.getSession().then(
      ({ data: { session } }) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          void sb
            .from("user_profiles")
            .select("*")
            .eq("id", u.id)
            .single()
            .then(
              ({ data }) => {
                if (data) setProfile(data as UserProfile);
                setLoading(false);
              },
              () => setLoading(false)
            );
        } else {
          setLoading(false);
        }
      },
      () => setLoading(false)
    );

    // Listen for auth changes
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setLoading(false);
        return;
      }
      if (u && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        void sb
          .from("user_profiles")
          .select("*")
          .eq("id", u.id)
          .single()
          .then(({ data }) => {
            if (data) setProfile(data as UserProfile);
          });
      }
    });

    return () => subscription.unsubscribe();
  }, [sb]);

  async function signOut() {
    await sb.auth.signOut();
    window.location.replace("/login");
  }

  const isAdmin = profile?.role === "admin";
  const isViloAccess = ["admin", "bd"].includes(profile?.role ?? "");
  const isVitalisAccess = ["admin", "coordinator"].includes(profile?.role ?? "");

  return { user, profile, loading, signOut, isAdmin, isViloAccess, isVitalisAccess };
}
