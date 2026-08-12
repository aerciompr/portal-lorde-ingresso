import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
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
  // Sempre via reconcile (aplica taxa/líquido reais da balance_transaction)
  const orderId = String(paymentIntent.metadata?.orderId || '').trim();
  if (orderId) {
    const { reconcileStripeOrder } = await import('@/lib/stripe-reconcile');
    const result = await reconcileStripeOrder(orderId, {
      paymentIntentId: paymentIntent.id,
    });
    if (result.ok) {
      console.log(
        `[STRIPE] paid ${orderId} status=${result.status}${result.alreadyPaid ? ' (already)' : ''}`
      );
    } else {
      console.warn(`[STRIPE] finalize failed ${orderId}:`, result.error);
      await reconcileByPaymentIntent(paymentIntent.id);
    }
    return;
  }
  const r = await reconcileByPaymentIntent(paymentIntent.id);
  console.log('[STRIPE] reconcile by PI', paymentIntent.id, r);
}

/** +1 mês (naive — pequeno desvio em finais de mês é aceitável pra cadência de goteira). */
function addOneMonth(d: Date): Date {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() + 1);
  return copy;
}

/** Mapeia status de assinatura Stripe -> enum interno de LoyaltyMembership. */
function mapSubscriptionStatus(s: Stripe.Subscription.Status): string {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due' || s === 'unpaid') return 'past_due';
  if (s === 'canceled' || s === 'incomplete_expired') return 'canceled';
  return 'pending';
}

async function handleLoyaltyCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return;
  const membershipId = String(session.metadata?.membershipId || '').trim();
  if (!membershipId) return;

  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  await prisma.loyaltyMembership.update({
    where: { id: membershipId },
    data: {
      stripeCustomerId: customerId || undefined,
      stripeSubscriptionId: subscriptionId || undefined,
    },
  }).catch((e) => console.error('[STRIPE WEBHOOK] loyalty checkout.session.completed', e));
}

async function handleLoyaltyInvoicePaid(invoice: Stripe.Invoice, stripe: Stripe) {
  // API Stripe atual: subscription não fica mais direto em invoice.subscription
  // (deprecado), e sim em invoice.parent.subscription_details.subscription.
  const subDetails = invoice.parent?.subscription_details;
  const subscriptionId =
    typeof subDetails?.subscription === 'string'
      ? subDetails.subscription
      : subDetails?.subscription?.id;
  if (!subscriptionId) return;

  const membership = await prisma.loyaltyMembership.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    include: { plan: true },
  });
  if (!membership) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  // current_period_start/end saíram do nível da subscription e foram para o item
  // (billing periods flexíveis) — usa o primeiro item, que é o Price do plano.
  const firstItem = subscription.items.data[0];
  const nowSec = Math.floor(Date.now() / 1000);
  const currentPeriodStart = new Date((firstItem?.current_period_start ?? nowSec) * 1000);
  const currentPeriodEnd = new Date(
    (firstItem?.current_period_end ?? nowSec + 30 * 86400) * 1000
  );

  // Cota de entradas grátis reseta todo mês via cron (nextMonthlyResetAt), não aqui —
  // desacoplada do ciclo de cobrança da Stripe, que pode ser trimestral/semestral/anual.
  const isFirstPayment = !membership.cardEmailSentAt;

  await prisma.loyaltyMembership.update({
    where: { id: membership.id },
    data: {
      status: 'active',
      currentPeriodStart,
      currentPeriodEnd,
      ...(isFirstPayment ? { nextMonthlyResetAt: addOneMonth(new Date()) } : {}),
    },
  });

  if (isFirstPayment) {
    try {
      const { generateLoyaltyCardPDF } = await import('@/lib/generate-loyalty-card');
      const { signCode } = await import('@/lib/validate-ticket');
      const { formatDateInAppTz } = await import('@/lib/timezone');
      const { sendLoyaltyCardEmail } = await import('@/lib/email');

      const pdfBytes = await generateLoyaltyCardPDF({
        buyerName: membership.buyerName,
        planName: membership.plan.name,
        cardCode: membership.cardCode,
        qrPayload: signCode(membership.cardCode),
        freeEntriesPerCycle: membership.plan.freeEntriesPerCycle,
        checkinsPerEntry: membership.plan.checkinsPerEntry,
        renewsOnLabel: `Renova em ${formatDateInAppTz(currentPeriodEnd, { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
      });

      const mail = await sendLoyaltyCardEmail({
        to: membership.buyerEmail,
        buyerName: membership.buyerName,
        planName: membership.plan.name,
        cardCode: membership.cardCode,
        pdfBytes: Buffer.from(pdfBytes),
      });

      if (mail.ok) {
        await prisma.loyaltyMembership.update({
          where: { id: membership.id },
          data: { cardEmailSentAt: new Date() },
        });
      } else {
        console.warn('[STRIPE WEBHOOK] falha ao enviar cartão fidelidade', mail.error);
      }
    } catch (e) {
      console.error('[STRIPE WEBHOOK] geração/envio do cartão fidelidade falhou', e);
    }
  }
}

async function handleLoyaltySubscriptionUpdated(subscription: Stripe.Subscription) {
  const membership = await prisma.loyaltyMembership.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  if (!membership) return;
  await prisma.loyaltyMembership.update({
    where: { id: membership.id },
    data: { status: mapSubscriptionStatus(subscription.status) },
  });
}

async function handleLoyaltySubscriptionDeleted(subscription: Stripe.Subscription) {
  const membership = await prisma.loyaltyMembership.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  if (!membership) return;
  await prisma.loyaltyMembership.update({
    where: { id: membership.id },
    data: { status: 'canceled', canceledAt: new Date() },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') || '';

  let event: Stripe.Event;
  let stripeClient: Stripe | null = null;

  try {
    const { stripe, endpointSecret } = await getStripeAndSecret();
    stripeClient = stripe;
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

    // ── Clube de fidelidade — assinatura recorrente ──
    if (event.type === 'checkout.session.completed') {
      await handleLoyaltyCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === 'invoice.paid' && stripeClient) {
      await handleLoyaltyInvoicePaid(event.data.object as Stripe.Invoice, stripeClient);
    }

    if (event.type === 'customer.subscription.updated') {
      await handleLoyaltySubscriptionUpdated(event.data.object as Stripe.Subscription);
    }

    if (event.type === 'customer.subscription.deleted') {
      await handleLoyaltySubscriptionDeleted(event.data.object as Stripe.Subscription);
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
