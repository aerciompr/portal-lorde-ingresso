import { getAppSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';

/**
 * Cupom simples via Settings:
 * - promo_code (ex.: LORDE10)
 * - promo_percent (ex.: 10)
 * - promo_active ("1" / "true")
 */
export async function applyPromoCode(
  totalCents: number,
  promoCode?: string | null
): Promise<{ totalCents: number; discountCents: number; applied: string | null }> {
  const code = (promoCode || '').trim().toUpperCase();
  if (!code || totalCents <= 0) {
    return { totalCents, discountCents: 0, applied: null };
  }

  let expected = '';
  let percent = 0;
  let active = false;

  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['promo_code', 'promo_percent', 'promo_active'] } },
    });
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.key] = r.value;
    });
    expected = (map.promo_code || '').trim().toUpperCase();
    percent = parseFloat(map.promo_percent || '0') || 0;
    active = map.promo_active === '1' || map.promo_active === 'true';
  } catch {
    const s = await getAppSettings();
    // fallback: sem cupom se DB falhar
    void s;
  }

  if (!active || !expected || code !== expected) {
    return { totalCents, discountCents: 0, applied: null };
  }
  if (percent <= 0 || percent > 100) {
    return { totalCents, discountCents: 0, applied: null };
  }

  const discountCents = Math.min(
    totalCents,
    Math.round((totalCents * percent) / 100)
  );
  return {
    totalCents: Math.max(0, totalCents - discountCents),
    discountCents,
    applied: expected,
  };
}
