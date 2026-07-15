import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { cleanupPendingOrders } from '@/lib/order-stock';
import { prisma } from '@/lib/prisma';
import { requireAdminMutation } from '@/lib/request-security';

/** GET: prévia de quantos pedidos pendentes seriam limpos */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const minutes = Math.max(5, parseInt(searchParams.get('minutes') || '30', 10) || 30);
  const eventId = searchParams.get('eventId') || undefined;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  const count = await prisma.order.count({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
      ...(eventId ? { eventId } : {}),
    },
  });

  const sample = await prisma.order.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
      ...(eventId ? { eventId } : {}),
    },
    include: {
      event: { select: { title: true } },
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  return NextResponse.json({
    minutes,
    eventId: eventId || null,
    count,
    sample: sample.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      event: o.event.title,
      tickets: o._count.tickets,
      totalCents: o.totalCents,
      buyerEmail: o.buyerEmail || '(sem e-mail)',
    })),
  });
}

/** POST: limpa pedidos pending e devolve estoque */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  try {
    const body = await req.json().catch(() => ({}));
    // 0 = todos os pending; default 30 min
    const minutes = Math.max(0, parseInt(String(body.minutes ?? 30), 10) || 0);
    const eventId = body.eventId || null;
    const onlyAbandoned = body.onlyAbandoned === true || body.onlyAbandoned === '1';
    const repairCancelled = body.repairCancelled === true || body.repairCancelled === '1';

    const result = await cleanupPendingOrders({
      minutes,
      eventId,
      onlyAbandoned,
    });

    let repair: { fixed: number; ticketsReleased: number } | null = null;
    if (repairCancelled) {
      const { repairCancelledOrdersStock } = await import('@/lib/order-stock');
      repair = await repairCancelledOrdersStock();
    }

    const parts = [
      result.cleaned === 0
        ? minutes <= 0
          ? 'Nenhum pending para limpar.'
          : `Nenhum pending com mais de ${minutes} min.`
        : `${result.cleaned} cancelado(s), ${result.ticketsReleased} ingresso(s) devolvido(s)`,
    ];
    if (result.skippedPaid) {
      parts.push(`${result.skippedPaid} pago(s) no Stripe (não cancelados)`);
    }
    if (repair && repair.fixed > 0) {
      parts.push(
        `reparo: ${repair.fixed} cancelado(s) com estoque preso → ${repair.ticketsReleased} liberado(s)`
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
      repair,
      message: parts.join(' · '),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro na limpeza';
    console.error('[ADMIN CLEANUP PENDING]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
