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
      logs: {
        orderBy: { createdAt: 'asc' },
        take: 200,
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  }

  const { buyerPasswordHash, logs, ...rest } = order as typeof order & {
    buyerPasswordHash?: string | null;
    logs?: Array<{
      id: string;
      kind: string;
      title: string;
      detail: string | null;
      createdAt: Date;
    }>;
  };

  const timeline: TimelineItem[] = [];

  // Preferir logs reais (erros de cartão, tentativas, etc.)
  for (const log of logs || []) {
    timeline.push({
      at: log.createdAt.toISOString(),
      kind: log.kind,
      title: log.title,
      detail: log.detail || undefined,
    });
  }

  // Fallback / complementos se ainda não houver log de criação
  if (!(logs || []).some((l) => l.kind === 'created')) {
    timeline.push({
      at: order.createdAt.toISOString(),
      kind: 'created',
      title: 'Pedido criado',
      detail:
        order.buyerName === 'Checkout em andamento' || !order.buyerEmail
          ? 'Checkout iniciado (cliente ainda não preenchido ou abandonado)'
          : `Cliente: ${order.buyerName}`,
    });
  }

  if (order.paidAt && !(logs || []).some((l) => l.kind === 'paid')) {
    timeline.push({
      at: order.paidAt.toISOString(),
      kind: 'paid',
      title: 'Pagamento confirmado',
      detail: `Status: ${order.status}`,
    });
  }

  if (order.emailSentAt && !(logs || []).some((l) => l.kind === 'email')) {
    timeline.push({
      at: order.emailSentAt.toISOString(),
      kind: 'email',
      title: 'E-mail de ingresso enviado',
      detail: `Para ${order.buyerEmail}`,
    });
  }

  if ((order.feeDetails || '').includes(MIGRATION_EMAIL_MARKER)) {
    if (!(logs || []).some((l) => l.kind === 'email_migration')) {
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
  }

  if (
    (order.status === 'cancelled' || order.status === 'canceled') &&
    !(logs || []).some((l) => l.kind === 'cancelled')
  ) {
    timeline.push({
      at: order.createdAt.toISOString(),
      kind: 'cancelled',
      title: 'Pedido cancelado',
      detail: order.feeDetails || undefined,
    });
  }

  if (order.status === 'refunded' && !(logs || []).some((l) => l.kind === 'refunded')) {
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
