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

/**
 * Lista pedidos admin com paginação e filtros.
 * ?page=1&limit=50&status=paid|pending|refunded|cancelled|all&q=busca
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
  const usePaging = pageRaw != null || searchParams.has('limit') || searchParams.has('paged');

  const statusRaw = (searchParams.get('status') || 'all').toLowerCase().trim();
  const q = (searchParams.get('q') || searchParams.get('search') || '').trim();

  const where: Prisma.OrderWhereInput = {};

  if (statusRaw && statusRaw !== 'all') {
    const aliases = STATUS_ALIASES[statusRaw] || [statusRaw];
    where.status = aliases.length === 1 ? aliases[0] : { in: aliases };
  }

  if (q) {
    where.OR = [
      { buyerName: { contains: q } },
      { buyerEmail: { contains: q } },
      { accessCode: { contains: q } },
      { paymentId: { contains: q } },
      { externalId: { contains: q } },
      { id: { contains: q } },
      { event: { title: { contains: q } } },
    ];
  }

  // Contagens por status (sem o filtro de status, mas com a busca)
  const whereForCounts: Prisma.OrderWhereInput = q
    ? {
        OR: [
          { buyerName: { contains: q } },
          { buyerEmail: { contains: q } },
          { accessCode: { contains: q } },
          { paymentId: { contains: q } },
          { externalId: { contains: q } },
          { id: { contains: q } },
          { event: { title: { contains: q } } },
        ],
      }
    : {};

  const [total, orders, countAll, countPaid, countPending, countRefunded, countCancelled] =
    await Promise.all([
      usePaging ? prisma.order.count({ where }) : Promise.resolve(undefined),
      prisma.order.findMany({
        where,
        include: {
          event: { select: { title: true } },
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
          ...whereForCounts,
          status: { in: ['cancelled', 'canceled'] },
        },
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

  if (!pageRaw && !searchParams.has('paged') && !searchParams.has('status') && !q) {
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
    statusCounts,
  });
}
