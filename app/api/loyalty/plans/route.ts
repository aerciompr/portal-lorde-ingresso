import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/loyalty/plans
 * Público — lista pacotes ativos do clube de fidelidade para a página de assinatura.
 * Nunca expõe stripePriceId nem qualquer dado interno (mesma filosofia de lib/settings-public.ts).
 */
export async function GET() {
  try {
    const plans = await prisma.loyaltyPlan.findMany({
      where: { active: true },
      orderBy: { priceCents: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        priceCents: true,
        freeEntriesPerCycle: true,
        checkinsPerEntry: true,
        overageDiscountPercent: true,
      },
    });
    return NextResponse.json({ plans });
  } catch (e) {
    console.error('[loyalty/plans GET]', e);
    return NextResponse.json({ plans: [] });
  }
}
