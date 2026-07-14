import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertCheckinStaff, dayBoundsSaoPaulo } from '@/lib/checkin-staff';

/**
 * GET /api/checkin/events?scope=today|upcoming|all
 * Eventos com chips: total / check-in / faltam (só pedidos paid).
 */
export async function GET(req: NextRequest) {
  const gate = assertCheckinStaff(req);
  if (gate !== true) return gate;

  const scope = (req.nextUrl.searchParams.get('scope') || 'today').toLowerCase();
  const { start, end } = dayBoundsSaoPaulo();

  // today | upcoming (todos futuros) | past | all (hoje+futuros) | everything (todos no banco)
  let where: { date?: { gte?: Date; lte?: Date; gt?: Date; lt?: Date } } = {};
  let orderBy: { date: 'asc' | 'desc' } = { date: 'asc' };
  let take = 200;

  if (scope === 'today') {
    where = { date: { gte: start, lte: end } };
    take = 50;
  } else if (scope === 'upcoming') {
    // todos os eventos depois de hoje (sem limite de 30 dias)
    where = { date: { gt: end } };
    orderBy = { date: 'asc' };
    take = 200;
  } else if (scope === 'past') {
    where = { date: { lt: start } };
    orderBy = { date: 'desc' };
    take = 100;
  } else if (scope === 'everything') {
    where = {};
    orderBy = { date: 'desc' };
    take = 300;
  } else {
    // all = hoje + futuros
    where = { date: { gte: start } };
    orderBy = { date: 'asc' };
    take = 250;
  }

  const events = await prisma.event.findMany({
    where,
    orderBy,
    take,
    select: {
      id: true,
      title: true,
      slug: true,
      date: true,
      openTime: true,
      address: true,
      imageUrl: true,
    },
  });

  if (events.length === 0) {
    return NextResponse.json({ events: [], scope });
  }

  const eventIds = events.map((e) => e.id);

  // Tickets pagos (valid + used) por evento
  const tickets = await prisma.ticket.findMany({
    where: {
      status: { in: ['valid', 'used'] },
      order: {
        eventId: { in: eventIds },
        status: 'paid',
      },
    },
    select: {
      status: true,
      order: { select: { eventId: true } },
    },
  });

  const statsMap = new Map<string, { total: number; checkedIn: number }>();
  for (const id of eventIds) statsMap.set(id, { total: 0, checkedIn: 0 });

  for (const t of tickets) {
    const eid = t.order.eventId;
    const s = statsMap.get(eid);
    if (!s) continue;
    s.total += 1;
    if (t.status === 'used') s.checkedIn += 1;
  }

  const payload = events.map((e) => {
    const s = statsMap.get(e.id) || { total: 0, checkedIn: 0 };
    return {
      ...e,
      stats: {
        total: s.total,
        checkedIn: s.checkedIn,
        notCheckedIn: Math.max(0, s.total - s.checkedIn),
      },
    };
  });

  return NextResponse.json({ events: payload, scope });
}
