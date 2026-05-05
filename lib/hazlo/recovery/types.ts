export type PaymentFailureCategory =
  | "insufficient_funds"
  | "card_expired"
  | "fraud_block"
  | "network_error"
  | "unknown";

export type RecoverySentFlags = {
  d0_email?: string;
  network_bump?: string;
  d2_whatsapp?: string;
  d5_call?: string;
  d7_email?: string;
  canceled_survey?: string;
};

export type PaymentRecoveryState = {
  category?: PaymentFailureCategory;
  sent?: RecoverySentFlags;
  /** ISO — para error de red: segundo email “reintentá”. */
  network_bump_after?: string;
  /** Sugerencia operativa: reintento de cargo ~72h. */
  suggested_charge_retry_at?: string;
  /** Último resultado operativo (p. ej. envío WhatsApp plantilla Meta). */
  channel?: string;
  /** Siguiente paso sugerido para ops. */
  next_action?: string;
  /**
   * Intento de toque WhatsApp recovery (equivalente a `payment_recovery_attempts` si existiera en fila).
   * Se incrementa tras plantilla Meta exitosa; alimenta `sendRecoveryWhatsApp` (plantilla 1 vs 2).
   */
  whatsapp_recovery_attempts?: number;
  metrics?: {
    recovery_started_at?: string;
    recovered_at?: string;
    canceled_at?: string;
  };
};
