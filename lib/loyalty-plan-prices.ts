import { prisma } from '@/lib/prisma';

export const LOYALTY_INTERVALS = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
export type LoyaltyInterval = (typeof LOYALTY_INTERVALS)[number];

export type LoyaltyPlanPriceInput = {
  id?: string;
  interval: string;
  priceCents: number;
  stripePriceId: string | null;
  active: boolean;
};

/** Valida o array `prices` recebido no formulário de admin do plano. */
export function validateLoyaltyPlanPrices(
  prices: unknown
): { error: string } | { ok: true; items: LoyaltyPlanPriceInput[] } {
  if (!Array.isArray(prices) || prices.length === 0) {
    return { error: 'Informe ao menos uma periodicidade de cobrança' };
  }

  const seen = new Set<string>();
  const items: LoyaltyPlanPriceInput[] = [];

  for (const raw of prices) {
    const p = (raw || {}) as Record<string, unknown>;
    const interval = String(p.interval || '').trim();
    if (!(LOYALTY_INTERVALS as readonly string[]).includes(interval)) {
      return { error: `Periodicidade inválida: ${interval || '(vazia)'}` };
    }
    if (seen.has(interval)) {
      return { error: `Periodicidade repetida: ${interval}` };
    }
    seen.add(interval);

    const priceCents =
      typeof p.priceCents === 'number' ? p.priceCents : parseInt(String(p.priceCents), 10);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      return { error: `Preço inválido para a periodicidade ${interval}` };
    }

    items.push({
      id: p.id ? String(p.id) : undefined,
      interval,
      priceCents,
      stripePriceId: p.stripePriceId ? String(p.stripePriceId).trim().slice(0, 191) : null,
      active: p.active !== false && p.active !== '0',
    });
  }

  return { ok: true, items };
}

/**
 * Cria/atualiza as periodicidades (LoyaltyPlanPrice) de um plano a partir do array completo
 * enviado pelo form de admin. Periodicidades que não vierem na lista:
 * - sem nenhuma assinatura vinculada → apaga de verdade (nada de histórico a preservar).
 * - com assinatura(s) vinculada(s) → soft-delete (active:false), nunca apaga histórico.
 */
export async function syncLoyaltyPlanPrices(planId: string, items: LoyaltyPlanPriceInput[]) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.loyaltyPlanPrice.findMany({
      where: { planId },
      include: { _count: { select: { memberships: true } } },
    });
    const keepIds = new Set(items.filter((i) => i.id).map((i) => i.id));

    for (const ex of existing) {
      if (keepIds.has(ex.id)) continue;
      if (ex._count.memberships > 0) {
        await tx.loyaltyPlanPrice.update({ where: { id: ex.id }, data: { active: false } });
      } else {
        await tx.loyaltyPlanPrice.delete({ where: { id: ex.id } });
      }
    }

    for (const item of items) {
      if (item.id) {
        await tx.loyaltyPlanPrice.update({
          where: { id: item.id },
          data: {
            interval: item.interval,
            priceCents: item.priceCents,
            stripePriceId: item.stripePriceId,
            active: item.active,
          },
        });
      } else {
        await tx.loyaltyPlanPrice.create({
          data: {
            planId,
            interval: item.interval,
            priceCents: item.priceCents,
            stripePriceId: item.stripePriceId,
            active: item.active,
          },
        });
      }
    }
  });
}
