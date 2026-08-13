import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { parseYmdInApp } from '@/lib/period';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 40;

/**
 * GET /api/admin/loyalty-audit?action=&actor=&from=&to=&page=
 * Trilha de auditoria geral do clube (todas as entidades), paginada.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || '';
  const actor = searchParams.get('actor') || '';
  const fromStr = searchParams.get('from') || '';
  const toStr = searchParams.get('to') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (actor) where.actor = { contains: actor };
  const from = fromStr ? parseYmdInApp(fromStr) : null;
  const to = toStr ? parseYmdInApp(toStr) : null;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.loyaltyAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.loyaltyAuditLog.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE });
}
