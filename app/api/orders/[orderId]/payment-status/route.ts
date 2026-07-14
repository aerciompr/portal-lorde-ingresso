import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { finalizePaidOrder } from '@/lib/finalize-paid-order';
import { MercadoPagoConfig, Payment } from 'mercadopago';

/**
 * Status de pagamento em tempo real (polling do checkout / retorno).
 * - PIX pending → consulta Mercado Pago
 * - Cartão pending → consulta PaymentIntent no Stripe (backup do webhook)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      accessCode: true,
      paymentId: true,
      paymentGateway: true,
      paymentMethod: true,
      buyerEmail: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  }

  // Já pago
  if (order.status === 'paid') {
    const tickets = await prisma.ticket.findMany({
      where: { orderId: order.id },
      select: { id: true },
    });
    return NextResponse.json({
      status: 'paid',
      accessCode: order.accessCode,
      buyerEmail: order.buyerEmail,
      ticketIds: tickets.map((t) => t.id),
      message: 'Pagamento confirmado',
    });
  }

  if (order.status === 'cancelled' || order.status === 'refunded') {
    return NextResponse.json({
      status: order.status,
      message: order.status === 'cancelled' ? 'Pedido cancelado' : 'Pedido estornado',
    });
  }

  // Pending + PIX: tenta sincronizar com MP (fonte da verdade)
  if (
    order.status === 'pending' &&
    order.paymentGateway === 'mercadopago' &&
    order.paymentId
  ) {
    try {
      const s = await getAppSettings();
      const token = s.payment.mpAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
      if (token) {
        const client = new MercadoPagoConfig({ accessToken: token });
        const payment = new Payment(client);
        const result: any = await payment.get({ id: String(order.paymentId) });
        const data = result?.body || result;
        const mpStatus = String(data?.status || '').toLowerCase();

        if (mpStatus === 'approved' || mpStatus === 'accredited') {
          await finalizePaidOrder(order.id, {
            paymentId: String(order.paymentId),
            paymentMethod: 'pix',
            paymentGateway: 'mercadopago',
          });
          const refreshed = await prisma.order.findUnique({
            where: { id: order.id },
            select: {
              status: true,
              accessCode: true,
              buyerEmail: true,
              tickets: { select: { id: true } },
            },
          });
          return NextResponse.json({
            status: 'paid',
            accessCode: refreshed?.accessCode,
            buyerEmail: refreshed?.buyerEmail,
            ticketIds: (refreshed?.tickets || []).map((t) => t.id),
            message: 'Pagamento confirmado',
            synced: true,
          });
        }

        if (['rejected', 'cancelled', 'canceled', 'expired'].includes(mpStatus)) {
          return NextResponse.json({
            status: 'pending',
            mpStatus,
            message: 'Pagamento não aprovado no Mercado Pago',
          });
        }

        return NextResponse.json({
          status: 'pending',
          mpStatus: mpStatus || 'waiting',
          message: 'Aguardando pagamento PIX…',
        });
      }
    } catch (e) {
      console.error('[payment-status] MP check failed', e);
    }
  }

  // Pending + Stripe (paymentId pi_* ou gateway stripe)
  const isStripePending =
    order.status === 'pending' &&
    Boolean(order.paymentId?.startsWith('pi_') || order.paymentGateway === 'stripe');

  if (isStripePending && order.paymentId) {
    try {
      const { reconcileStripeOrder } = await import('@/lib/stripe-reconcile');
      const r = await reconcileStripeOrder(order.id, {
        paymentIntentId: order.paymentId,
      });
      if (r.status === 'paid') {
        const refreshed = await prisma.order.findUnique({
          where: { id: order.id },
          select: {
            status: true,
            accessCode: true,
            buyerEmail: true,
            tickets: { select: { id: true } },
          },
        });
        return NextResponse.json({
          status: 'paid',
          accessCode: refreshed?.accessCode,
          buyerEmail: refreshed?.buyerEmail,
          ticketIds: (refreshed?.tickets || []).map((t) => t.id),
          message: 'Pagamento confirmado',
          synced: true,
          stripeStatus: r.stripeStatus,
        });
      }
      if (r.stripeStatus && ['canceled', 'cancelled'].includes(r.stripeStatus)) {
        return NextResponse.json({
          status: 'pending',
          stripeStatus: r.stripeStatus,
          message: 'Pagamento cancelado no Stripe',
        });
      }
      return NextResponse.json({
        status: 'pending',
        stripeStatus: r.stripeStatus,
        message:
          r.stripeStatus === 'requires_payment_method' ||
          r.stripeStatus === 'requires_action'
            ? 'Aguardando confirmação do cartão…'
            : 'Aguardando pagamento…',
      });
    } catch (e) {
      console.error('[payment-status] Stripe check failed', e);
    }
  }

  return NextResponse.json({
    status: order.status,
    message: 'Aguardando pagamento…',
  });
}
