import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { finalizePaidOrder } from '@/lib/finalize-paid-order';
import { releaseOrderStock } from '@/lib/order-stock';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import crypto from 'crypto';

const getMPAccessToken = async () => {
  const s = await getAppSettings();
  return s.payment.mpAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
};

async function fetchMpPayment(paymentId: string | number, accessToken: string) {
  try {
    const client = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(client);
    const result: any = await payment.get({ id: String(paymentId) });
    return result?.body || result;
  } catch (e) {
    console.error('[MP WEBHOOK] payment.get failed', e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const xSignature = req.headers.get('x-signature') || '';
  const xRequestId = req.headers.get('x-request-id') || '';
  const MP_ACCESS_TOKEN = await getMPAccessToken();

  console.log('[MP WEBHOOK] Received:', JSON.stringify(body).slice(0, 500));

  if (xSignature && MP_ACCESS_TOKEN) {
    const match = xSignature.match(/ts=(\d+),v1=([a-f0-9]+)/i);
    if (match) {
      const ts = match[1];
      const v1 = match[2];
      const id = body.data?.id || body.id;
      const manifest = `id:${id};request-id:${xRequestId};ts:${ts};`;
      const hmac = crypto.createHmac('sha256', MP_ACCESS_TOKEN);
      hmac.update(manifest);
      const computed = hmac.digest('hex');
      if (computed !== v1) {
        console.warn('[MP WEBHOOK] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }
    }
  }

  const paymentId = body.data?.id || body.id;
  if (!paymentId) {
    return NextResponse.json({ ok: true });
  }

  // Busca status real do pagamento na API do MP (fonte da verdade)
  const mpPayment = MP_ACCESS_TOKEN
    ? await fetchMpPayment(paymentId, MP_ACCESS_TOKEN)
    : null;

  const status = (mpPayment?.status || body.data?.status || body.status || '').toString().toLowerCase();
  const externalRef = mpPayment?.external_reference
    ? String(mpPayment.external_reference)
    : body.external_reference
      ? String(body.external_reference)
      : null;

  // Localiza o pedido pelo paymentId ou external_reference (orderId)
  let order = await prisma.order.findFirst({
    where: { paymentId: String(paymentId) },
    include: { tickets: true, event: true, cancellationRequests: true },
  });

  if (!order && externalRef) {
    order = await prisma.order.findUnique({
      where: { id: externalRef },
      include: { tickets: true, event: true, cancellationRequests: true },
    });
  }

  if (!order) {
    console.log('[MP WEBHOOK] order not found for payment', paymentId);
    return NextResponse.json({ ok: true });
  }

  // Pagamento aprovado → liberar ingressos + e-mail
  if (
    (body.type === 'payment' || body.action === 'payment.updated' || body.action === 'payment.created' || !body.type) &&
    (status === 'approved' || status === 'accredited')
  ) {
    if (order.status === 'pending') {
      await finalizePaidOrder(order.id, {
        paymentId: String(paymentId),
        paymentMethod: 'pix',
        paymentGateway: 'mercadopago',
      });
    }
  }

  // Pagamento rejeitado/cancelado/expirado → devolve estoque se ainda pending
  if (['rejected', 'cancelled', 'canceled', 'expired', 'refunded'].includes(status)) {
    if (order.status === 'pending') {
      await releaseOrderStock(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: status === 'refunded' ? 'refunded' : 'cancelled',
          feeDetails: `mp status: ${status}`,
        },
      });
      console.log(`[MP] pending order ${order.id} closed (${status}), stock released`);
    } else if (status === 'refunded' && order.status === 'paid') {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
      await prisma.ticket.updateMany({ where: { orderId: order.id }, data: { status: 'cancelled' } });

      const pending = order.cancellationRequests?.find((cr: { status: string }) => cr.status === 'pending');
      if (pending) {
        await prisma.cancellationRequest.update({
          where: { id: pending.id },
          data: { status: 'approved', processedAt: new Date(), adminNotes: 'Reembolso processado via webhook MP' },
        });
      }
      console.log(`[MP] refund processed for ${order.id}`);
    }
  }

  return NextResponse.json({ ok: true });
}
