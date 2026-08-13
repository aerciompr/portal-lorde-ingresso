import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { parseYmdInApp } from '@/lib/period';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERVAL_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

function monthKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Maceio',
    year: 'numeric',
    month: '2-digit',
  }).format(d);
}

function monthsBack(n: number, ref = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref);
    d.setMonth(d.getMonth() - i);
    out.push(monthKey(d));
  }
  return out;
}

/**
 * GET /api/admin/loyalty-reports?from=&to=
 * Série temporal (novos sócios/cancelamentos/MRR por mês), distribuição por
 * plano/periodicidade, e ranking de eventos por reconhecimento de sócio no check-in.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get('from') || '';
  const toStr = searchParams.get('to') || '';

  const to = toStr ? parseYmdInApp(toStr) || new Date() : new Date();
  const from = fromStr
    ? parseYmdInApp(fromStr) || new Date(to.getFullYear(), to.getMonth() - 5, 1)
    : new Date(to.getFullYear(), to.getMonth() - 5, 1);
  const toEnd = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);

  const [newMembers, canceledMembers, activeWithPrice, planCounts, checkinLogs] =
    await Promise.all([
      prisma.loyaltyMembership.findMany({
        where: { createdAt: { gte: from, lte: toEnd } },
        select: { createdAt: true },
      }),
      prisma.loyaltyMembership.findMany({
        where: { status: 'canceled', canceledAt: { gte: from, lte: toEnd } },
        select: { canceledAt: true },
      }),
      prisma.loyaltyMembership.findMany({
        where: { status: 'active' },
        select: { planPrice: { select: { priceCents: true, interval: true } } },
      }),
      prisma.loyaltyMembership.groupBy({
        by: ['planId'],
        where: { status: { in: ['active', 'past_due', 'pending'] } },
        _count: { planId: true },
      }),
      prisma.loyaltyAuditLog.findMany({
        where: { action: 'checkin_recognized', createdAt: { gte: from, lte: toEnd } },
        select: { meta: true },
      }),
    ]);

  const months = monthsBack(
    Math.max(1, Math.min(24, Math.round((to.getTime() - from.getTime()) / (30 * 86400 * 1000)) + 1)),
    to
  );

  const newByMonth: Record<string, number> = {};
  for (const m of months) newByMonth[m] = 0;
  for (const m of newMembers) {
    const k = monthKey(m.createdAt);
    if (k in newByMonth) newByMonth[k]++;
  }

  const canceledByMonth: Record<string, number> = {};
  for (const m of months) canceledByMonth[m] = 0;
  for (const m of canceledMembers) {
    if (!m.canceledAt) continue;
    const k = monthKey(m.canceledAt);
    if (k in canceledByMonth) canceledByMonth[k]++;
  }

  const mrrCents = activeWithPrice.reduce((sum, m) => {
    if (!m.planPrice) return sum;
    const div = INTERVAL_MONTHS[m.planPrice.interval] || 1;
    return sum + Math.round(m.planPrice.priceCents / div);
  }, 0);

  const series = months.map((m) => ({
    month: m,
    newMembers: newByMonth[m],
    canceled: canceledByMonth[m],
  }));

  const planIds = planCounts.map((p) => p.planId);
  const plans = planIds.length
    ? await prisma.loyaltyPlan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, name: true },
      })
    : [];
  const planNameById = new Map(plans.map((p) => [p.id, p.name]));
  const distribution = planCounts
    .map((p) => ({ planName: planNameById.get(p.planId) || '—', count: p._count.planId }))
    .sort((a, b) => b.count - a.count);

  const eventCounts = new Map<string, { eventTitle: string; count: number }>();
  for (const log of checkinLogs) {
    if (!log.meta) continue;
    try {
      const meta = JSON.parse(log.meta) as { eventId?: string; eventTitle?: string };
      const key = meta.eventId || meta.eventTitle || 'desconhecido';
      const title = meta.eventTitle || 'Evento não identificado';
      const cur = eventCounts.get(key) || { eventTitle: title, count: 0 };
      cur.count++;
      eventCounts.set(key, cur);
    } catch {
      // meta malformado, ignora
    }
  }
  const eventRanking = Array.from(eventCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return NextResponse.json({
    period: { from: from.toISOString(), to: toEnd.toISOString() },
    series,
    mrrCents,
    distribution,
    eventRanking,
  });
}
