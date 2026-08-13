import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/loyalty/plans
 * Público — lista pacotes ativos do clube de fidelidade, com as periodicidades ativas
 * de cada um, para a página de assinatura. Nunca expõe stripePriceId nem qualquer
 * dado interno (mesma filosofia de lib/settings-public.ts).
 */
export async function GET() {
  try {
    const [plans, activeMembersCount] = await Promise.all([
      prisma.loyaltyPlan.findMany({
        where: { active: true, prices: { some: { active: true } } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          freeEntriesPerCycle: true,
          checkinsPerEntry: true,
          overageDiscountPercent: true,
          prices: {
            where: { active: true },
            orderBy: { priceCents: 'asc' },
            select: { id: true, interval: true, priceCents: true },
          },
        },
      }),
      prisma.loyaltyMembership.count({ where: { status: 'active' } }),
    ]);
    return NextResponse.json({ plans, activeMembersCount });
  } catch (e) {
    console.error('[loyalty/plans GET]', e);
    return NextResponse.json({ plans: [], activeMembersCount: 0 });
  }
}
