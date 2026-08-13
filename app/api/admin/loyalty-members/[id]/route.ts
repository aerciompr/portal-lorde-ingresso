import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/loyalty-members/[id] — detalhe completo + timeline de auditoria. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const membership = await prisma.loyaltyMembership.findUnique({
    where: { id },
    include: {
      plan: true,
      planPrice: true,
      redemptions: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { event: { select: { title: true, date: true } } },
      },
      cancellationRequests: {
        orderBy: { requestedAt: 'desc' },
        take: 10,
      },
      referredBy: { select: { id: true, buyerName: true, cardCode: true } },
      referrals: {
        select: { id: true, buyerName: true, buyerEmail: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: 'Sócio não encontrado' }, { status: 404 });
  }

  const auditLog = await prisma.loyaltyAuditLog.findMany({
    where: { entityType: 'LoyaltyMembership', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ membership, auditLog });
}
