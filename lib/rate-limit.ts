/**
 * Rate limit em memória (por instância). Suficiente para frear força bruta
 * em login/lookup num único container EasyPanel.
 */

type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const cur = buckets.get(opts.key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, retryAfterSec: 0 };
  }
  cur.count += 1;
  if (cur.count > opts.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
    };
  }
  return { ok: true, remaining: opts.limit - cur.count, retryAfterSec: 0 };
}

/** Limpa entradas expiradas de tempos em tempos */
export function pruneRateLimits() {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k);
  }
}
