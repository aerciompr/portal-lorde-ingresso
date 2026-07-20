import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Bucket = {
  grossCents: number;
  netCents: number;
  feeCents: number;
  refundCents: number;
  paidOrders: number;
  paidTickets: number;
  refundedOrders: number;
  pendingOrders: number;
};

function emptyBucket(): Bucket {
  return {
    grossCents: 0,
    netCents: 0,
    feeCents: 0,
    refundCents: 0,
    paidOrders: 0,
    paidTickets: 0,
    refundedOrders: 0,
    pendingOrders: 0,
  };
}

function addOrder(
  b: Bucket,
  o: {
    status: string;
    totalCents: number;
    grossCents: number;
    netCents: number;
    feeCents: number;
    tickets: { id: string }[];
  }
) {
  const status = (o.status || '').toLowerCase();
  const gross = o.grossCents || o.totalCents || 0;
  const net = o.netCents || 0;
  const fee = o.feeCents || 0;
  const tix = o.tickets?.length || 0;

  if (status === 'paid') {
    b.grossCents += gross;
    b.netCents += net;
    b.feeCents += fee;
    b.paidOrders += 1;
    b.paidTickets += tix;
  } else if (status === 'refunded') {
    b.refundCents += gross;
    b.refundedOrders += 1;
  } else if (status === 'pending') {
    b.pendingOrders += 1;
  }
}

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const fromStr = url.searchParams.get('from'); // YYYY-MM-DD
    const toStr = url.searchParams.get('to');
    const eventIdFilter = (url.searchParams.get('eventId') || '').trim() || null;

    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (fromStr) {
      fromDate = new Date(fromStr + 'T00:00:00');
      if (Number.isNaN(fromDate.getTime())) fromDate = null;
    }
    if (toStr) {
      toDate = new Date(toStr + 'T23:59:59.999');
      if (Number.isNaN(toDate.getTime())) toDate = null;
    }

    const [events, ordersRaw] = await Promise.all([
      prisma.event.findMany({
        where: eventIdFilter ? { id: eventIdFilter } : undefined,
        select: {
          id: true,
          title: true,
          date: true,
          slug: true,
          ticketTypes: {
            select: { id: true, name: true, totalQty: true, sold: true, priceCents: true },
          },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.order.findMany({
        where: {
          status: { in: ['paid', 'refunded', 'pending', 'cancelled', 'canceled'] },
          ...(eventIdFilter ? { eventId: eventIdFilter } : {}),
        },
        select: {
          id: true,
          status: true,
          totalCents: true,
          grossCents: true,
          netCents: true,
          feeCents: true,
          paymentMethod: true,
          eventId: true,
          loteId: true,
          createdAt: true,
          paidAt: true,
          tickets: {
            select: {
              id: true,
              ticketTypeId: true,
              ticketType: { select: { name: true } },
            },
          },
          lote: { select: { id: true, nome: true } },
          event: { select: { id: true, title: true, date: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Filtro de período: pago usa paidAt; demais usam createdAt
    const orders = ordersRaw.filter((o) => {
      if (!fromDate && !toDate) return true;
      const t = (o.paidAt || o.createdAt).getTime();
      if (fromDate && t < fromDate.getTime()) return false;
      if (toDate && t > toDate.getTime()) return false;
      return true;
    });

    const general = emptyBucket();
    const byMethod: Record<string, Bucket> = {};
    const byEventMap: Record<
      string,
      Bucket & {
        eventId: string;
        title: string;
        date: string;
        byLote: Record<string, Bucket & { name: string }>;
        byTicketType: Record<string, { name: string; paidTickets: number; grossCents: number }>;
      }
    > = {};

    for (const ev of events) {
      byEventMap[ev.id] = {
        ...emptyBucket(),
        eventId: ev.id,
        title: ev.title,
        date: ev.date.toISOString(),
        byLote: {},
        byTicketType: {},
      };
      for (const tt of ev.ticketTypes) {
        byEventMap[ev.id].byTicketType[tt.id] = {
          name: tt.name,
          paidTickets: 0,
          grossCents: 0,
        };
      }
    }

    for (const o of orders) {
      addOrder(general, o);

      const method = (o.paymentMethod || 'outro').toLowerCase();
      if (!byMethod[method]) byMethod[method] = emptyBucket();
      addOrder(byMethod[method], o);

      const eventId = o.eventId;
      if (!byEventMap[eventId]) {
        byEventMap[eventId] = {
          ...emptyBucket(),
          eventId,
          title: o.event?.title || 'Evento',
          date: o.event?.date?.toISOString?.() || '',
          byLote: {},
          byTicketType: {},
        };
      }
      const evBucket = byEventMap[eventId];
      addOrder(evBucket, o);

      const loteKey = o.lote?.id || 'sem-lote';
      const loteName = o.lote?.nome || 'Sem lote';
      if (!evBucket.byLote[loteKey]) {
        evBucket.byLote[loteKey] = { ...emptyBucket(), name: loteName };
      }
      addOrder(evBucket.byLote[loteKey], o);

      const status = (o.status || '').toLowerCase();
      if (status === 'paid') {
        const perTicketGross =
          (o.tickets?.length || 0) > 0
            ? Math.round((o.grossCents || o.totalCents || 0) / o.tickets.length)
            : 0;
        for (const t of o.tickets || []) {
          const tid = t.ticketTypeId || 'unknown';
          if (!evBucket.byTicketType[tid]) {
            evBucket.byTicketType[tid] = {
              name: t.ticketType?.name || 'Tipo',
              paidTickets: 0,
              grossCents: 0,
            };
          } else if (t.ticketType?.name) {
            evBucket.byTicketType[tid].name = t.ticketType.name;
          }
          evBucket.byTicketType[tid].paidTickets += 1;
          evBucket.byTicketType[tid].grossCents += perTicketGross;
        }
      }
    }

    // Preenche nomes de ticket type a partir do catálogo
    for (const ev of events) {
      const b = byEventMap[ev.id];
      if (!b) continue;
      for (const tt of ev.ticketTypes) {
        if (b.byTicketType[tt.id]) b.byTicketType[tt.id].name = tt.name;
      }
    }

    const byEvent = Object.values(byEventMap)
      .map((e) => ({
        eventId: e.eventId,
        title: e.title,
        date: e.date,
        grossCents: e.grossCents,
        netCents: e.netCents,
        feeCents: e.feeCents,
        refundCents: e.refundCents,
        paidOrders: e.paidOrders,
        paidTickets: e.paidTickets,
        refundedOrders: e.refundedOrders,
        pendingOrders: e.pendingOrders,
        byLote: Object.values(e.byLote).sort((a, b) => b.grossCents - a.grossCents),
        byTicketType: Object.values(e.byTicketType).sort((a, b) => b.paidTickets - a.paidTickets),
        catalog: events.find((x) => x.id === e.eventId)?.ticketTypes || [],
      }))
      .sort((a, b) => {
        // eventos com venda primeiro, depois por data desc
        if (b.paidOrders !== a.paidOrders) return b.paidOrders - a.paidOrders;
        return (b.date || '').localeCompare(a.date || '');
      });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      period: {
        from: fromStr || null,
        to: toStr || null,
        eventId: eventIdFilter,
      },
      general: {
        ...general,
        byMethod: Object.entries(byMethod).map(([method, b]) => ({ method, ...b })),
      },
      byEvent,
    });
  } catch (e) {
    console.error('[admin/reports]', e);
    return NextResponse.json(
      { error: (e as Error).message || 'Falha ao gerar relatórios' },
      { status: 500 }
    );
  }
}
