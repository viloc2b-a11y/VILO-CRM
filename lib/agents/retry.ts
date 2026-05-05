/**
 * Reintentos con backoff exponencial + jitter (agentes idempotentes / webhooks duplicados).
 */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withExponentialBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  isRetryable: (err: unknown) => boolean,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const base = options?.baseDelayMs ?? 250;
  const cap = options?.maxDelayMs ?? 8_000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt === maxAttempts || !isRetryable(e)) throw e;
      const exp = Math.min(cap, base * 2 ** (attempt - 1));
      const jitter = Math.random() * 0.25 * exp;
      await sleep(exp + jitter);
    }
  }
  throw lastErr;
}

export function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket") ||
    msg.includes("525") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}
