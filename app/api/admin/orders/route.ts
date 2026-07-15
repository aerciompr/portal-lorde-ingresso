import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import type { Prisma } from '@prisma/client';

const STATUS_ALIASES: Record<string, string[]> = {
  paid: ['paid'],
  pending: ['pending'],
  refunded: ['refunded'],
  cancelled: ['cancelled', 'canceled'],
  canceled: ['cancelled', 'canceled'],
};

function buildSearchOr(q: string): Prisma.OrderWhereInput['OR'] {
  return [
    { buyerName: { contains: q } },
    { buyerEmail: { contains: q } },
    { buyerCpf: { contains: q } },
    { buyerPhone: { contains: q } },
    { accessCode: { contains: q } },
    { paymentId: { contains: q } },
    { externalId: { contains: q } },
    { id: { contains: q } },
    { event: { title: { contains: q } } },
  ];
}

/**
 * Lista pedidos admin com paginação e filtros.
 * ?page=1&limit=50
 * &status=paid|pending|refunded|cancelled|all
 * &q=busca
 * &eventId=
 * &source=portal|woocommerce|all
 * &gateway=stripe|mercadopago|all
 * &method=card|pix|all
 * &from=YYYY-MM-DD&to=YYYY-MM-DD  (createdAt)
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pageRaw = searchParams.get('page');
  const limit = Math.min(
    500,
    Math.max(1, parseInt(searchParams.get('limit') || (pageRaw ? '50' : '200'), 10) || 50)
  );
  const page = Math.max(1, parseInt(pageRaw || '1', 10) || 1);
  const usePaging =
    pageRaw != null ||
    searchParams.has('limit') ||
    searchParams.has('paged') ||
    searchParams.has('status') ||
    searchParams.has('eventId') ||
    searchParams.has('q');

  const statusRaw = (searchParams.get('status') || 'all').toLowerCase().trim();
  const q = (searchParams.get('q') || searchParams.get('search') || '').trim();
  const eventId = (searchParams.get('eventId') || '').trim();
  const source = (searchParams.get('source') || 'all').toLowerCase().trim();
  const gateway = (searchParams.get('gateway') || 'all').toLowerCase().trim();
  const method = (searchParams.get('method') || 'all').toLowerCase().trim();
  const from = (searchParams.get('from') || '').trim();
  const to = (searchParams.get('to') || '').trim();

  const and: Prisma.OrderWhereInput[] = [];

  if (statusRaw && statusRaw !== 'all') {
    const aliases = STATUS_ALIASES[statusRaw] || [statusRaw];
    and.push({
      status: aliases.length === 1 ? aliases[0] : { in: aliases },
    });
  }

  if (eventId) {
    and.push({ eventId });
  }

  if (source && source !== 'all') {
    and.push({ source });
  }

  if (gateway && gateway !== 'all') {
    and.push({
      OR: [
        { paymentGateway: gateway },
        { paymentGateway: { contains: gateway } },
      ],
    });
  }

  if (method && method !== 'all') {
    and.push({
      OR: [
        { paymentMethod: method },
        { paymentMethod: { contains: method } },
      ],
    });
  }

  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) {
      const d = new Date(`${from}T00:00:00`);
      if (!Number.isNaN(d.getTime())) createdAt.gte = d;
    }
    if (to) {
      const d = new Date(`${to}T23:59:59.999`);
      if (!Number.isNaN(d.getTime())) createdAt.lte = d;
    }
    if (Object.keys(createdAt).length) and.push({ createdAt });
  }

  if (q) {
    and.push({ OR: buildSearchOr(q) });
  }

  const where: Prisma.OrderWhereInput = and.length ? { AND: and } : {};

  // Contagens por status: mesmos filtros exceto status
  const andForCounts = and.filter((c) => !('status' in c));
  const whereForCounts: Prisma.OrderWhereInput =
    andForCounts.length ? { AND: andForCounts } : {};

  const [total, orders, countAll, countPaid, countPending, countRefunded, countCancelled, events] =
    await Promise.all([
      usePaging ? prisma.order.count({ where }) : Promise.resolve(undefined),
      prisma.order.findMany({
        where,
        include: {
          event: { select: { id: true, title: true } },
          lote: { select: { nome: true } },
          tickets: {
            select: {
              id: true,
              uniqueCode: true,
              status: true,
              ticketType: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        ...(usePaging ? { skip: (page - 1) * limit, take: limit } : { take: limit }),
      }),
      prisma.order.count({ where: whereForCounts }),
      prisma.order.count({ where: { ...whereForCounts, status: 'paid' } }),
      prisma.order.count({ where: { ...whereForCounts, status: 'pending' } }),
      prisma.order.count({ where: { ...whereForCounts, status: 'refunded' } }),
      prisma.order.count({
        where: {
          AND: [
            ...(andForCounts.length ? andForCounts : []),
            { status: { in: ['cancelled', 'canceled'] } },
          ],
        },
      }),
      // Eventos que têm pedidos (para o select)
      prisma.event.findMany({
        where: { orders: { some: {} } },
        select: { id: true, title: true, date: true },
        orderBy: { date: 'desc' },
        take: 200,
      }),
    ]);

  const safe = orders.map((o) => {
    const { buyerPasswordHash, ...rest } = o as typeof o & {
      buyerPasswordHash?: string | null;
    };
    return { ...rest, hasPassword: Boolean(buyerPasswordHash) };
  });

  const statusCounts = {
    all: countAll,
    paid: countPaid,
    pending: countPending,
    refunded: countRefunded,
    cancelled: countCancelled,
  };

  if (
    !pageRaw &&
    !searchParams.has('paged') &&
    !searchParams.has('status') &&
    !q &&
    !eventId
  ) {
    return NextResponse.json(safe);
  }

  return NextResponse.json({
    orders: safe,
    page,
    limit,
    total: total ?? safe.length,
    totalPages: total != null ? Math.max(1, Math.ceil(total / limit)) : 1,
    status: statusRaw,
    q,
    eventId: eventId || null,
    source,
    gateway,
    method,
    from: from || null,
    to: to || null,
    statusCounts,
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
    })),
  });
}
