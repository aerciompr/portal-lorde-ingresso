import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { cleanupPendingOrders } from '@/lib/order-stock';
import { prisma } from '@/lib/prisma';

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
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const minutes = Math.max(5, parseInt(String(body.minutes || 30), 10) || 30);
    const eventId = body.eventId || null;

    const result = await cleanupPendingOrders({ minutes, eventId });

    return NextResponse.json({
      success: true,
      ...result,
      message:
        result.cleaned === 0
          ? `Nenhum pedido pendente com mais de ${minutes} minutos.`
          : `${result.cleaned} pedido(s) cancelado(s). ${result.ticketsReleased} ingresso(s) devolvido(s) ao estoque.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro na limpeza';
    console.error('[ADMIN CLEANUP PENDING]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
