import type { Json } from "@/lib/supabase/types";
import type { PaymentRecoveryState } from "@/lib/hazlo/recovery/types";

export function parseRecoveryState(raw: Json | null | undefined): PaymentRecoveryState {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as PaymentRecoveryState;
  }
  return {};
}
