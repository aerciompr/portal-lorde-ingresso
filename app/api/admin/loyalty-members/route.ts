import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

/**
 * GET /api/admin/loyalty-members?q=&status=&page=
 * Lista de sócios com busca (nome/e-mail/cardCode) e filtro de status.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const status = searchParams.get('status') || 'all';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const where: Record<string, unknown> = {};
  if (status !== 'all') where.status = status;
  if (q) {
    where.OR = [
      { buyerName: { contains: q } },
      { buyerEmail: { contains: q } },
      { cardCode: { contains: q.toUpperCase() } },
    ];
  }

  try {
    const [items, total] = await Promise.all([
      prisma.loyaltyMembership.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          cardCode: true,
          buyerName: true,
          buyerEmail: true,
          status: true,
          entriesUsedInPeriod: true,
          currentPeriodEnd: true,
          createdAt: true,
          plan: { select: { name: true, freeEntriesPerCycle: true } },
          planPrice: { select: { interval: true } },
        },
      }),
      prisma.loyaltyMembership.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE });
  } catch (e) {
    console.error('[admin/loyalty-members GET]', e);
    return NextResponse.json({ error: 'Erro ao listar sócios' }, { status: 500 });
  }
}
