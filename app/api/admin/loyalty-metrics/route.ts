import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERVAL_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * GET /api/admin/loyalty-metrics
 * KPIs simples do clube: assinantes por status, MRR normalizado por periodicidade,
 * churn aproximado dos últimos 30 dias.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);

  const [statusCounts, activeWithPrice, canceledLast30d, newLast30d] = await Promise.all([
    prisma.loyaltyMembership.groupBy({ by: ['status'], _count: { status: true } }),
    prisma.loyaltyMembership.findMany({
      where: { status: 'active' },
      select: { planPrice: { select: { priceCents: true, interval: true } } },
    }),
    prisma.loyaltyMembership.count({
      where: { status: 'canceled', canceledAt: { gte: thirtyDaysAgo } },
    }),
    prisma.loyaltyMembership.count({
      where: { createdAt: { gte: thirtyDaysAgo }, status: { in: ['active', 'past_due'] } },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of statusCounts) counts[row.status] = row._count.status;

  const mrrCents = activeWithPrice.reduce((sum, m) => {
    if (!m.planPrice) return sum;
    const months = INTERVAL_MONTHS[m.planPrice.interval] || 1;
    return sum + Math.round(m.planPrice.priceCents / months);
  }, 0);

  const activeCount = counts.active || 0;
  const churnBase = activeCount + canceledLast30d;
  const churnPercent = churnBase > 0 ? (canceledLast30d / churnBase) * 100 : 0;

  return NextResponse.json({
    activeCount,
    pastDueCount: counts.past_due || 0,
    pendingCount: counts.pending || 0,
    canceledCount: counts.canceled || 0,
    canceledLast30d,
    newLast30d,
    mrrCents,
    churnPercent: Math.round(churnPercent * 10) / 10,
  });
}
