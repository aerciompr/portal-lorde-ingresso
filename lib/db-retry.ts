/**
 * Retry leve para erros transitórios de MySQL/Prisma
 * (lock wait 1205, deadlock 1213).
 */

const TRANSIENT_RE =
  /1205|1213|Lock wait timeout|Deadlock|try restarting transaction|P2034/i;

export function isTransientDbError(e: unknown): boolean {
  if (!e) return false;
  const msg = e instanceof Error ? e.message : String(e);
  const code =
    typeof e === 'object' && e !== null && 'code' in e
      ? String((e as { code?: string }).code || '')
      : '';
  return TRANSIENT_RE.test(msg) || TRANSIENT_RE.test(code);
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; label?: string }
): Promise<T> {
  const retries = opts?.retries ?? 3;
  const label = opts?.label || 'db';
  let last: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransientDbError(e) || attempt === retries) throw e;
      const delayMs = 40 * attempt + Math.floor(Math.random() * 80);
      console.warn(
        `[db-retry] ${label} attempt ${attempt}/${retries} transient error, wait ${delayMs}ms`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}
