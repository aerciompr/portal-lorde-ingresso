import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

/**
 * Lista pedidos admin com paginação.
 * ?page=1&limit=50 (default limit 100, max 500)
 * Resposta: { orders, page, limit, total, totalPages } se page informado;
 * ou array legado se sem page (compat).
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageRaw = searchParams.get('page');
  const limit = Math.min(
    500,
    Math.max(1, parseInt(searchParams.get('limit') || (pageRaw ? '50' : '200'), 10) || 50)
  );
  const page = Math.max(1, parseInt(pageRaw || '1', 10) || 1);
  const usePaging = pageRaw != null || searchParams.has('limit');

  const where = {};
  const total = usePaging ? await prisma.order.count({ where }) : undefined;

  const orders = await prisma.order.findMany({
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
    ...(usePaging
      ? { skip: (page - 1) * limit, take: limit }
      : { take: limit }),
  });

  const safe = orders.map((o) => {
    const { buyerPasswordHash, ...rest } = o as typeof o & {
      buyerPasswordHash?: string | null;
    };
    return { ...rest, hasPassword: Boolean(buyerPasswordHash) };
  });

  // Compat: clientes antigos esperam array
  if (!pageRaw && !searchParams.has('paged')) {
    return NextResponse.json(safe);
  }

  return NextResponse.json({
    orders: safe,
    page,
    limit,
    total: total ?? safe.length,
    totalPages: total != null ? Math.max(1, Math.ceil(total / limit)) : 1,
  });
}
