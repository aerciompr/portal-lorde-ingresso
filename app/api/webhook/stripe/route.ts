import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { sendOrderConfirmation } from '@/lib/email';
import { signCode } from '@/lib/validate-ticket';
import { getFeeForMethod, getAppSettings } from '@/lib/settings';

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
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { tickets: true, event: true },
      });

      if (order && order.status === 'pending') {
        // Não sobrescreve accessCode se já foi gerado no pay (evita inconsistência para o comprador)
        const updateData: any = { status: 'paid', paymentId: paymentIntent.id, paidAt: new Date() };
        if (!order.accessCode) {
          updateData.accessCode = 'LN-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        }

        // fee from DB Settings
        const feeInfo = await getFeeForMethod('card');
        const fee = Math.round(order.totalCents * feeInfo.percent / 100) + feeInfo.fixedCents;
        updateData.grossCents = order.totalCents;
        updateData.netCents = order.totalCents - fee;
        updateData.feeCents = fee;
        updateData.feeDetails = feeInfo.details;

        await prisma.order.update({
          where: { id: orderId },
          data: updateData,
        });

        for (const t of order.tickets) {
          await prisma.ticket.update({ where: { id: t.id }, data: { qrPayload: signCode(t.uniqueCode) } });
        }

        const fullOrder = await prisma.order.findUnique({
          where: { id: orderId },
          include: { tickets: { include: { ticketType: true } }, event: true },
        });
        if (fullOrder) await sendOrderConfirmation(fullOrder as unknown as import('@/lib/email').OrderWithDetails);

        // Virada automática (Fase 2) - após venda paga
        if (order.loteId) {
          const { performAutomaticVirada } = await import('@/app/api/admin/lotes/virar/route');
          await performAutomaticVirada(order.eventId);
        }

        console.log(`[STRIPE] paid ${orderId}`);
      }
    }
  }

  // Refund events
  if (event.type === 'charge.refunded') {
    const obj: any = event.data.object;
    const pi = obj.payment_intent || (obj.charges?.data?.[0]?.payment_intent);
    if (pi) {
      const order = await prisma.order.findFirst({ where: { paymentId: pi } });
      if (order && (order.status === 'paid' || order.status === 'pending')) {
        await prisma.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
        await prisma.ticket.updateMany({ where: { orderId: order.id }, data: { status: 'cancelled' } });

        const pending = await prisma.cancellationRequest.findFirst({ where: { orderId: order.id, status: 'pending' } });
        if (pending) {
          await prisma.cancellationRequest.update({
            where: { id: pending.id },
            data: { status: 'approved', processedAt: new Date(), adminNotes: 'Reembolso via webhook Stripe' },
          });
        }
        console.log(`[STRIPE] refund processed for ${order.id}`);
      }
    }
  }

  return NextResponse.json({ received: true });
}
