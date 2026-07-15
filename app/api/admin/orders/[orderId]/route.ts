import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { MIGRATION_EMAIL_MARKER } from '@/lib/email-migration';

export const dynamic = 'force-dynamic';

type TimelineItem = {
  at: string;
  kind: string;
  title: string;
  detail?: string;
};

/**
 * GET /api/admin/orders/[orderId]
 * Detalhe do pedido + timeline (criado, pago, e-mail, cancelamento).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          date: true,
          openTime: true,
          address: true,
        },
      },
      lote: { select: { id: true, nome: true, precoCents: true } },
      tickets: {
        include: {
          ticketType: { select: { id: true, name: true, priceCents: true } },
        },
        orderBy: { uniqueCode: 'asc' },
      },
      cancellationRequests: {
        orderBy: { requestedAt: 'desc' },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  }

  const { buyerPasswordHash, ...rest } = order as typeof order & {
    buyerPasswordHash?: string | null;
  };

  const timeline: TimelineItem[] = [];

  timeline.push({
    at: order.createdAt.toISOString(),
    kind: 'created',
    title: 'Pedido criado',
    detail:
      order.buyerName === 'Checkout em andamento' || !order.buyerEmail
        ? 'Checkout iniciado (cliente ainda não preenchido ou abandonado)'
        : `Cliente: ${order.buyerName}`,
  });

  if (order.paymentGateway || order.paymentId || order.paymentMethod) {
    timeline.push({
      at: order.createdAt.toISOString(),
      kind: 'payment_setup',
      title: 'Meio de pagamento',
      detail: [
        order.paymentGateway && `Gateway: ${order.paymentGateway}`,
        order.paymentMethod && `Método: ${order.paymentMethod}`,
        order.paymentId && `ID: ${order.paymentId}`,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  if (order.paidAt) {
    timeline.push({
      at: order.paidAt.toISOString(),
      kind: 'paid',
      title: 'Pagamento confirmado',
      detail: `Status: ${order.status} · Bruto ${(order.grossCents || order.totalCents) / 100}`,
    });
  }

  if (order.emailSentAt) {
    timeline.push({
      at: order.emailSentAt.toISOString(),
      kind: 'email',
      title: 'E-mail de ingresso enviado',
      detail: `Para ${order.buyerEmail}`,
    });
  } else if (order.paidAt && order.status === 'paid') {
    timeline.push({
      at: order.paidAt.toISOString(),
      kind: 'email_unknown',
      title: 'E-mail de confirmação',
      detail:
        'Disparo no momento do pagamento (se RESEND_API_KEY estiver ok). Sem registro de data — reenvie pelo admin se necessário.',
    });
  }

  if ((order.feeDetails || '').includes(MIGRATION_EMAIL_MARKER)) {
    const m = (order.feeDetails || '').match(
      /migration-email-sent\s*\|\s*(\d{4}-\d{2}-\d{2})/
    );
    timeline.push({
      at: m
        ? `${m[1]}T12:00:00.000Z`
        : order.emailSentAt?.toISOString() || order.createdAt.toISOString(),
      kind: 'email_migration',
      title: 'E-mail de migração (Woo → portal)',
      detail: order.feeDetails || undefined,
    });
  }

  if (order.status === 'cancelled' || order.status === 'canceled') {
    timeline.push({
      at: order.paidAt?.toISOString() || order.createdAt.toISOString(),
      kind: 'cancelled',
      title: 'Pedido cancelado',
      detail:
        order.feeDetails ||
        'Se a limpeza rodou, o estoque foi devolvido (tickets cancelados)',
    });
  }

  if (order.status === 'refunded') {
    timeline.push({
      at: order.paidAt?.toISOString() || order.createdAt.toISOString(),
      kind: 'refunded',
      title: 'Pedido estornado',
      detail: order.feeDetails || undefined,
    });
  }

  for (const cr of order.cancellationRequests || []) {
    timeline.push({
      at: cr.requestedAt.toISOString(),
      kind: 'cancel_request',
      title: `Solicitação de cancelamento (${cr.status})`,
      detail: cr.reason?.slice(0, 200),
    });
    if (cr.processedAt) {
      timeline.push({
        at: cr.processedAt.toISOString(),
        kind: 'cancel_processed',
        title: 'Cancelamento processado',
        detail: cr.adminNotes || undefined,
      });
    }
  }

  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const ticketsActive = order.tickets.filter((t) => t.status !== 'cancelled').length;
  const ticketsCancelled = order.tickets.filter((t) => t.status === 'cancelled').length;

  return NextResponse.json({
    order: {
      ...rest,
      hasPassword: Boolean(buyerPasswordHash),
      ticketsActive,
      ticketsCancelled,
    },
    timeline,
  });
}
