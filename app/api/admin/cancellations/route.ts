import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import { restoreStockOnRefund } from '@/lib/order-stock';
import { sendCancellationApproved } from '@/lib/email';
import { getAppSettings } from '@/lib/settings';
import Stripe from 'stripe';
import { MercadoPagoConfig, PaymentRefund } from 'mercadopago';

/** Lista solicitações de cancelamento (admin). */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get('status') || 'pending';
  const where =
    status === 'all'
      ? {}
      : { status: status === 'pending' ? 'pending' : status };

  const items = await prisma.cancellationRequest.findMany({
    where,
    orderBy: { requestedAt: 'desc' },
    take: 100,
    include: {
      order: {
        include: {
          event: { select: { id: true, title: true, date: true, cancelFeePercent: true } },
          tickets: { select: { id: true, uniqueCode: true, status: true } },
        },
      },
    },
  });

  return NextResponse.json({ items });
}

/**
 * Aprovar (estorno) ou recusar solicitação.
 * body: { id, action: 'approve' | 'reject', adminNotes? }
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  const action = String(body.action || '');
  const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes.trim() : '';

  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id e action (approve|reject) obrigatórios' }, { status: 400 });
  }

  const cr = await prisma.cancellationRequest.findUnique({
    where: { id },
    include: {
      order: {
        include: { event: true, tickets: true, cancellationRequests: true },
      },
    },
  });

  if (!cr) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
  if (cr.status !== 'pending') {
    return NextResponse.json({ error: `Solicitação já está: ${cr.status}` }, { status: 400 });
  }

  if (action === 'reject') {
    await prisma.cancellationRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        processedAt: new Date(),
        adminNotes: adminNotes || 'Solicitação recusada pelo admin',
      },
    });
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  // approve → estorno (mesma lógica de /api/admin/refund)
  const order = cr.order;
  if (!order || order.status !== 'paid') {
    await prisma.cancellationRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        processedAt: new Date(),
        adminNotes: 'Pedido não está pago — não é possível estornar',
      },
    });
    return NextResponse.json({ error: 'Pedido não elegível para estorno' }, { status: 400 });
  }

  const feePercent = order.event?.cancelFeePercent ?? 0;
  const refundCents = Math.round(order.totalCents * (1 - feePercent / 100));

  const s = await getAppSettings();
  const STRIPE_SECRET = s.payment.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '';
  const STRIPE_ACCOUNT_ID = s.payment.stripeAccountId || '';
  const STRIPE_ACCESS_TOKEN = s.payment.stripeAccessToken || STRIPE_SECRET;
  const MP_ACCESS_TOKEN = s.payment.mpAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';

  const stripe = STRIPE_ACCESS_TOKEN ? new Stripe(STRIPE_ACCESS_TOKEN) : null;
  const mpClient = MP_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN }) : null;

  try {
    if (order.paymentGateway === 'stripe' && order.paymentId && stripe) {
      await stripe.refunds.create(
        { payment_intent: order.paymentId, amount: refundCents },
        STRIPE_ACCOUNT_ID ? { stripeAccount: STRIPE_ACCOUNT_ID } : undefined
      );
    } else if (order.paymentGateway === 'mercadopago' && order.paymentId && mpClient) {
      const refundClient = new PaymentRefund(mpClient);
      await refundClient.create({
        payment_id: Number(order.paymentId),
        body: { amount: refundCents / 100 },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CANCEL-APPROVE] gateway refund failed', msg);
    return NextResponse.json(
      { error: 'Falha ao estornar no gateway: ' + msg },
      { status: 500 }
    );
  }

  const stock = await restoreStockOnRefund(order.id);

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'refunded',
      feeDetails: [order.feeDetails, `estorno: ${stock.reason}`]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 250),
    },
  });

  await prisma.cancellationRequest.update({
    where: { id },
    data: {
      status: 'approved',
      processedAt: new Date(),
      adminNotes:
        adminNotes ||
        `Aprovado. Reembolso ${(refundCents / 100).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })} (taxa ${feePercent}%). ${stock.reason}`,
    },
  });

  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: {
      tickets: { include: { ticketType: true } },
      event: true,
    },
  });
  if (fullOrder) {
    try {
      await sendCancellationApproved(fullOrder as never, refundCents);
    } catch (e) {
      console.error('[CANCEL-APPROVE] e-mail falhou', e);
    }
  }

  return NextResponse.json({ ok: true, status: 'approved', refundCents, stock });
}
