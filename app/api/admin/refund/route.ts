import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import Stripe from 'stripe';
import { MercadoPagoConfig, PaymentRefund } from 'mercadopago';
import { sendCancellationApproved } from '@/lib/email';
import { getAppSettings } from '@/lib/settings';

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { orderId } = await req.json();
  if (!orderId) return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { event: true, cancellationRequests: true },
  });

  if (!order || order.status !== 'paid') {
    return NextResponse.json({ error: 'Pedido não elegível para estorno' }, { status: 400 });
  }

  // Calculate refund amount based on event rules
  const feePercent = order.event?.cancelFeePercent ?? 0;
  const refundCents = Math.round(order.totalCents * (1 - feePercent / 100));

  const s = await getAppSettings();
  const STRIPE_SECRET = s.payment.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '';
  const MP_ACCESS_TOKEN = s.payment.mpAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
  const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;
  const mpClient = MP_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN }) : null;

  try {
    if (order.paymentGateway === 'stripe' && order.paymentId && stripe) {
      await stripe.refunds.create({
        payment_intent: order.paymentId,
        amount: refundCents,
      });
    } else if (order.paymentGateway === 'mercadopago' && order.paymentId && mpClient) {
      const refundClient = new PaymentRefund(mpClient);
      await refundClient.create({
        payment_id: Number(order.paymentId),
        body: {
          amount: refundCents / 100,
        },
      });
    } else {
      // No gateway configured or paymentId missing - allow marking as refunded for manual processing
      console.warn('[REFUND] No gateway configured or paymentId missing for order', orderId);
    }
  } catch (err: any) {
    console.error('[REFUND] Gateway refund failed', err);
    return NextResponse.json({ error: 'Falha ao solicitar reembolso no gateway: ' + (err.message || '') }, { status: 500 });
  }

  // Update order and tickets
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'refunded' },
  });
  await prisma.ticket.updateMany({
    where: { orderId },
    data: { status: 'cancelled' },
  });

  // Mark any pending cancellation request as approved
  const pending = order.cancellationRequests.find((cr: any) => cr.status === 'pending');
  if (pending) {
    await prisma.cancellationRequest.update({
      where: { id: pending.id },
      data: {
        status: 'approved',
        processedAt: new Date(),
        adminNotes: `Reembolsado R$ ${(refundCents / 100).toFixed(2)} (taxa ${feePercent}%)`,
      },
    });
  }

  // Send email
  const fullOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tickets: { include: { ticketType: true } },
      event: true,
    },
  });

  if (fullOrder) {
    await sendCancellationApproved(fullOrder as any, refundCents);
  }

  return NextResponse.json({ success: true, refundCents });
}
