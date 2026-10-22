/**
 * Rate limit em memória por processo (janela deslizante simples).
 * Suficiente para a campanha; em várias instâncias serverless cada uma conta separado.
 * Se virar problema, trocar por tabela no Postgres ou Upstash mantendo esta assinatura.
 */
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

export interface RateLimitOptions { limit: number; windowMs: number }
export interface RateLimitResult { ok: boolean; remaining: number; retryAfterMs: number }

export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions, now = Date.now()): RateLimitResult {
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - b.hits[0]) };
  }
  b.hits.push(now);
  buckets.set(key, b);
  if (buckets.size > 50_000) buckets.clear(); // proteção contra crescimento sem limite
  return { ok: true, remaining: limit - b.hits.length, retryAfterMs: 0 };
}

/** Conta uma falha sem bloquear; usado para o bloqueio de PIN. */
export const RATE_LIMITS = {
  eligibilityIp: { limit: 20, windowMs: 60 * 60_000 },
  eligibilityPhone: { limit: 5, windowMs: 60 * 60_000 },
  submitIp: { limit: 10, windowMs: 60 * 60_000 },
  voucherLookupIp: { limit: 60, windowMs: 60_000 },
  recoverIp: { limit: 10, windowMs: 60 * 60_000 },
  pinFailures: { limit: 5, windowMs: 15 * 60_000 },
} as const;

export function resetRateLimits() { buckets.clear(); }
