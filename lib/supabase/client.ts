import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

function requireEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, anonKey };
}

/**
 * Browser / client components — `@supabase/ssr` cookie handling.
 * Not yet `createBrowserClient<Database>`: the hand-written `Database` in `types.ts`
 * must match `supabase gen types` output exactly for full insert/update inference.
 */
export function createClient(): SupabaseClient {
  const { url, anonKey } = requireEnv();
  return createBrowserClient(url, anonKey);
}

/** @deprecated Prefer `createClient()` — same implementation. */
export function createSupabaseBrowserClient(): SupabaseClient {
  return createClient();
}
