import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedServiceClient: SupabaseClient | null | undefined;

export function getServiceClientOrNull() {
  if (cachedServiceClient !== undefined) {
    return cachedServiceClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    cachedServiceClient = null;
    return cachedServiceClient;
  }

  try {
    cachedServiceClient = createClient(supabaseUrl, serviceRoleKey);
    return cachedServiceClient;
  } catch {
    cachedServiceClient = null;
    return cachedServiceClient;
  }
}

export const serviceClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getServiceClientOrNull();

    if (!client) {
      throw new Error("Supabase service role client is not configured.");
    }

    return Reflect.get(client as object, prop);
  },
});
