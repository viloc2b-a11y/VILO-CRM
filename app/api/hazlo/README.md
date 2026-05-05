# HazloAsíYa — rutas API (`app/api/hazlo/`)

```
app/api/hazlo/
├── square/
│   └── webhook/route.ts     # Webhook Square (firma oficial, idempotencia, recovery)
├── validator/tick/route.ts    # Validator Agent (cron)
├── recovery/tick/route.ts    # Recovery Agent (cron) — usa payment_status / payment_failed_at / payment_recovery_state (igual si el fallo vino de Square o Stripe)
├── growth/tick/route.ts     # Growth Agent (cron)
└── stripe/
    └── webhook/route.ts     # Opcional / legado (PaymentIntents)
```

- **Square:** `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_NOTIFICATION_URL` (ver `.env.example`).

### Square Developer Dashboard (webhook)

1. [Developer Console](https://developer.squareup.com/apps) → tu aplicación → **Webhooks** → **Add subscription** / endpoint.
2. **Notification URL:** `https://TU_DOMINIO/api/hazlo/square/webhook` (HTTPS, sin query string).
3. **Eventos** (catálogo Square v2): suscribí al menos **`payment.created`** y **`payment.updated`**. Los fallos de cobro llegan como **`payment.updated`** con `payment.status` (p. ej. `FAILED`, `CANCELED`), no como un tipo `payment.failed` separado. Opcional: **`refund.created`** / **`refund.updated`** (hoy el handler solo registra/ignora según tipo).
4. Copiá la **Signature key** del subscription → variable **`SQUARE_WEBHOOK_SIGNATURE_KEY`**.
5. **`SQUARE_WEBHOOK_NOTIFICATION_URL`** debe ser **exactamente** la misma cadena que pegaste en el dashboard (incluye `https`, dominio y path); la firma HMAC usa `notificationUrl + rawBody` y el header **`x-square-hmacsha256-signature`** (ver `lib/crypto/square.ts`).
6. **GET:** si llega `?challenge=...`, la ruta responde `{ "challenge": "<valor>" }`; si no, `{ "ok": true, "service": "hazlo-square-webhook" }`. Los **eventos reales** son siempre **POST** con JSON.
- **Recovery tick:** no lee `square_payment_id` ni `stripe_payment_intent_id`; solo filas con `payment_status = failed` y `payment_failed_at` poblados (los setean los webhooks).

SQL extra (columnas opcionales + `v_hazlo_metrics`): `supabase/30_hazlo_square_extras_and_metrics.sql`. El SQL “Opción C” completo del chat **no** aplica tal cual (ver comentarios al inicio de ese archivo).

Validator (confianza + cola + RPC): `supabase/31_hazlo_validator_sql_support.sql` — no uses plantillas con `hazlo_users` / `validation_status` / columnas inexistentes en `action_items`.
