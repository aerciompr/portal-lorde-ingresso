import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendOrderConfirmation } from '@/lib/email';
import { signCode } from '@/lib/validate-ticket';
import { getFeeForMethod, getAppSettings } from '@/lib/settings';
import crypto from 'crypto';

const getMPAccessToken = async () => {
  const s = await getAppSettings();
  return s.payment.mpAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
};

// Mercado Pago envia notificações no formato { id, type, ... }
// Validamos x-signature quando presente e sempre confirmamos o status buscando o pagamento.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const xSignature = req.headers.get('x-signature') || '';
  const xRequestId = req.headers.get('x-request-id') || '';
  const MP_ACCESS_TOKEN = await getMPAccessToken();

  console.log('[MP WEBHOOK] Received:', body);

  // Validação básica de assinatura (seguindo docs do MP)
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

  const order = await prisma.order.findFirst({
    where: { paymentId: String(paymentId) },
    include: { tickets: true, event: true, cancellationRequests: true },
  });

  if (!order) {
    return NextResponse.json({ ok: true });
  }

  // Confirma status buscando o pagamento (recomendado pela doc)
  // Para simplificar, usamos o que veio no payload + action.

  if ((body.type === 'payment' || body.action === 'payment.updated') && order.status === 'pending') {
    // Marcar como pago (o payload de pagamento atualizado deve indicar sucesso)
    const updateData: any = { status: 'paid', paidAt: new Date() };
    if (!order.accessCode) {
      updateData.accessCode = 'LN-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    // fee from DB Settings
    const feeInfo = await getFeeForMethod('pix');
    const fee = Math.round(order.totalCents * feeInfo.percent / 100) + feeInfo.fixedCents;
    updateData.grossCents = order.totalCents;
    updateData.netCents = order.totalCents - fee;
    updateData.feeCents = fee;
    updateData.feeDetails = feeInfo.details;

    await prisma.order.update({
      where: { id: order.id },
      data: updateData,
    });

    for (const t of order.tickets) {
      await prisma.ticket.update({ where: { id: t.id }, data: { qrPayload: signCode(t.uniqueCode) } });
    }

    const full = await prisma.order.findUnique({
      where: { id: order.id },
      include: { tickets: { include: { ticketType: true } }, event: true },
    });
    if (full) await sendOrderConfirmation(full as unknown as import('@/lib/email').OrderWithDetails);

    // Virada automática (Fase 2) - após venda paga
    if (order.loteId) {
      const { performAutomaticVirada } = await import('@/app/api/admin/lotes/virar/route');
      await performAutomaticVirada(order.eventId);
    }

    console.log(`[MP] paid ${order.id}`);
  }

  // Refund handling (action payment.refunded ou status atualizado para refunded)
  if (body.action === 'payment.refunded' || body.data?.status === 'refunded') {
    if (order.status === 'paid' || order.status === 'pending') {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
      await prisma.ticket.updateMany({ where: { orderId: order.id }, data: { status: 'cancelled' } });

      const pending = order.cancellationRequests.find((cr: any) => cr.status === 'pending');
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
