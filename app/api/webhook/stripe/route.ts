import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { finalizePaidOrder } from '@/lib/finalize-paid-order';
import { reconcileByPaymentIntent } from '@/lib/stripe-reconcile';

async function getStripeAndSecret() {
  const s = await getAppSettings();
  const key = (
    s.payment.stripeSecretKey ||
    process.env.STRIPE_SECRET_KEY ||
    ''
  ).trim();
  const raw = (await prisma.setting.findUnique({
    where: { key: 'stripe_webhook_secret' },
  }))?.value;
  const endpointSecret = (
    raw ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    ''
  ).trim();
  return {
    stripe: key ? new Stripe(key) : null,
    endpointSecret,
  };
}

async function markPaidFromIntent(paymentIntent: Stripe.PaymentIntent) {
  const orderId = String(paymentIntent.metadata?.orderId || '').trim();
  if (orderId) {
    const result = await finalizePaidOrder(orderId, {
      paymentId: paymentIntent.id,
      paymentMethod: 'card',
      paymentGateway: 'stripe',
    });
    if (result.ok) {
      console.log(
        `[STRIPE] paid ${orderId}${result.alreadyPaid ? ' (already)' : ''}`
      );
    } else {
      console.warn(`[STRIPE] finalize failed ${orderId}:`, result.error);
      // Fallback: achar por paymentId
      await reconcileByPaymentIntent(paymentIntent.id);
    }
    return;
  }
  // Sem metadata — reconcilia pelo id do PI
  const r = await reconcileByPaymentIntent(paymentIntent.id);
  console.log('[STRIPE] reconcile by PI', paymentIntent.id, r);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') || '';

  let event: Stripe.Event;

  try {
    const { stripe, endpointSecret } = await getStripeAndSecret();
    if (!stripe) {
      console.warn('[STRIPE WEBHOOK] No stripe key configured');
      return NextResponse.json({ received: true });
    }
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } else {
      console.warn(
        '[STRIPE WEBHOOK] Sem STRIPE_WEBHOOK_SECRET / stripe_webhook_secret — aceitando JSON (configure o secret em produção)'
      );
      event = JSON.parse(body);
    }
  } catch (err: unknown) {
    console.error(
      'Stripe webhook signature error',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 });
  }

  try {
    if (
      event.type === 'payment_intent.succeeded' ||
      event.type === 'payment_intent.amount_capturable_updated'
    ) {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      if (
        event.type === 'payment_intent.succeeded' ||
        String(paymentIntent.status).toLowerCase() === 'succeeded'
      ) {
        await markPaidFromIntent(paymentIntent);
      }
    }

    // Alguns fluxos disparam charge.succeeded com payment_intent
    if (event.type === 'charge.succeeded') {
      const charge = event.data.object as Stripe.Charge;
      const pi =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (pi) {
        await reconcileByPaymentIntent(pi);
      }
    }

    // Refund events
    if (event.type === 'charge.refunded') {
      const obj = event.data.object as Stripe.Charge;
      const pi =
        typeof obj.payment_intent === 'string'
          ? obj.payment_intent
          : obj.payment_intent?.id;
      if (pi) {
        const order = await prisma.order.findFirst({
          where: { paymentId: String(pi) },
        });
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
  } catch (e) {
    console.error('[STRIPE WEBHOOK] handler error', e);
    // 200 para Stripe não reintentar em loop se for bug nosso de negócio
  }

  return NextResponse.json({ received: true });
}
