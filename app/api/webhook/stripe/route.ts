import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { finalizePaidOrder } from '@/lib/finalize-paid-order';

const getStripe = async () => {
  const s = await getAppSettings();
  const key = s.payment.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '';
  return key ? new Stripe(key) : null;
};
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') || '';

  let event: Stripe.Event;

  try {
    const stripe = await getStripe();
    if (!stripe) {
      console.warn('[STRIPE WEBHOOK] No stripe key configured');
      return NextResponse.json({ received: true });
    }
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } else {
      event = JSON.parse(body); // dev sem assinatura
    }
  } catch (err: unknown) {
    console.error('Stripe webhook signature error', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const orderId = paymentIntent.metadata?.orderId;

    if (orderId) {
      const result = await finalizePaidOrder(orderId, {
        paymentId: paymentIntent.id,
        paymentMethod: 'card',
        paymentGateway: 'stripe',
      });
      if (result.ok) {
        console.log(`[STRIPE] paid ${orderId}${result.alreadyPaid ? ' (already)' : ''}`);
      } else {
        console.warn(`[STRIPE] finalize failed ${orderId}:`, result.error);
      }
    }
  }

  // Refund events
  if (event.type === 'charge.refunded') {
    const obj: any = event.data.object;
    const pi = obj.payment_intent || (obj.charges?.data?.[0]?.payment_intent);
    if (pi) {
      const order = await prisma.order.findFirst({ where: { paymentId: String(pi) } });
      if (order && order.status === 'paid') {
        const { restoreStockOnRefund } = await import('@/lib/order-stock');
        const stock = await restoreStockOnRefund(order.id);
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'refunded',
            feeDetails: [order.feeDetails, `estorno stripe: ${stock.reason}`]
              .filter(Boolean)
              .join(' | ')
              .slice(0, 250),
          },
        });

        const pending = await prisma.cancellationRequest.findFirst({
          where: { orderId: order.id, status: 'pending' },
        });
        if (pending) {
          await prisma.cancellationRequest.update({
            where: { id: pending.id },
            data: {
              status: 'approved',
              processedAt: new Date(),
              adminNotes: `Reembolso via webhook Stripe. ${stock.reason}`,
            },
          });
        }
        console.log(`[STRIPE] refund processed for ${order.id}`, stock);
      } else if (order && order.status === 'pending') {
        const { releaseOrderStock } = await import('@/lib/order-stock');
        await releaseOrderStock(order.id);
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'refunded' },
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
