import { prisma } from '@/lib/prisma';
import { sendOrderConfirmation } from '@/lib/email';
import { signCode } from '@/lib/validate-ticket';
import { getFeeForMethod } from '@/lib/settings';

/**
 * Finaliza um pedido após confirmação de pagamento (webhook MP/Stripe ou reconciliação).
 * - marca paid + paidAt
 * - gera QR nos tickets
 * - envia e-mail de confirmação (se RESEND_API_KEY)
 * - tenta virada automática de lote
 */
export async function finalizePaidOrder(
  orderId: string,
  options?: {
    paymentId?: string;
    paymentMethod?: 'pix' | 'card' | string;
    paymentGateway?: string;
    /** Quando informado (ex. balance_transaction Stripe), sobrescreve estimativa de taxas */
    grossCents?: number;
    feeCents?: number;
    netCents?: number;
    feeDetails?: string;
  }
): Promise<{ ok: boolean; alreadyPaid?: boolean; error?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { tickets: true, event: true },
  });

  if (!order) return { ok: false, error: 'Pedido não encontrado' };
  if (order.status === 'paid') return { ok: true, alreadyPaid: true };
  if (order.status !== 'pending') {
    return { ok: false, error: `Status inválido: ${order.status}` };
  }

  const method = options?.paymentMethod || order.paymentMethod || 'pix';
  const feeInfo = await getFeeForMethod(method === 'card' ? 'card' : 'pix');
  const estimatedFee =
    Math.round((order.totalCents * feeInfo.percent) / 100) + feeInfo.fixedCents;

  // Preferência: valores reais do gateway (Stripe balance_transaction)
  const grossCents =
    typeof options?.grossCents === 'number' ? options.grossCents : order.totalCents;
  const fee =
    typeof options?.feeCents === 'number' ? options.feeCents : estimatedFee;
  const netCents =
    typeof options?.netCents === 'number'
      ? options.netCents
      : grossCents - fee;
  const feeDetails =
    options?.feeDetails ||
    `${feeInfo.details}${typeof options?.netCents === 'number' ? '' : ' (estimado)'}`;

  const updateData: Record<string, unknown> = {
    status: 'paid',
    paidAt: new Date(),
    grossCents,
    netCents,
    feeCents: fee,
    feeDetails: String(feeDetails).slice(0, 250),
  };

  if (options?.paymentId) updateData.paymentId = String(options.paymentId);
  if (options?.paymentGateway) updateData.paymentGateway = options.paymentGateway;
  if (options?.paymentMethod) updateData.paymentMethod = options.paymentMethod;
  if (!order.accessCode) {
    updateData.accessCode = 'LN-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  await prisma.order.update({
    where: { id: orderId },
    data: updateData,
  });

  try {
    const { markPromoApplied } = await import('@/lib/promo');
    await markPromoApplied(orderId, order.buyerEmail);
  } catch (e) {
    console.error('[FINALIZE] promo mark applied failed', e);
  }

  try {
    const { logOrderEvent } = await import('@/lib/order-log');
    await logOrderEvent(
      orderId,
      'paid',
      'Pagamento confirmado',
      [
        options?.paymentGateway && `gateway=${options.paymentGateway}`,
        options?.paymentMethod && `método=${options.paymentMethod}`,
        options?.paymentId && `id=${options.paymentId}`,
      ]
        .filter(Boolean)
        .join(' · ') || null,
      {
        paymentId: options?.paymentId,
        paymentGateway: options?.paymentGateway,
        paymentMethod: options?.paymentMethod,
      }
    );
  } catch {
    /* ignore */
  }

  for (const t of order.tickets) {
    if (!t.qrPayload) {
      await prisma.ticket.update({
        where: { id: t.id },
        data: { qrPayload: signCode(t.uniqueCode), status: 'valid' },
      });
    }
  }

  const fullOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tickets: { include: { ticketType: true } },
      event: true,
      lote: true,
    },
  });

  if (fullOrder) {
    try {
      const mail = await sendOrderConfirmation(
        fullOrder as unknown as import('@/lib/email').OrderWithDetails
      );
      if (!mail.ok) {
        console.error('[FINALIZE] e-mail não enviado (pedido JÁ está pago):', mail.error || mail);
        const { logOrderEvent } = await import('@/lib/order-log');
        await logOrderEvent(
          orderId,
          'email_fail',
          'E-mail de confirmação não enviado',
          (mail as { error?: string }).error || 'falha Resend'
        );
      } else {
        await prisma.order.update({
          where: { id: orderId },
          data: { emailSentAt: new Date() },
        });
        const { logOrderEvent } = await import('@/lib/order-log');
        await logOrderEvent(
          orderId,
          'email',
          'E-mail de ingresso enviado',
          fullOrder.buyerEmail
        );
      }
    } catch (e) {
      console.error('[FINALIZE] e-mail falhou (pedido já está pago):', e);
      try {
        const { logOrderEvent } = await import('@/lib/order-log');
        await logOrderEvent(
          orderId,
          'email_fail',
          'Exceção ao enviar e-mail',
          e instanceof Error ? e.message : 'erro'
        );
      } catch {
        /* ignore */
      }
    }

    try {
      const { notifyWhatsAppPaid } = await import('@/lib/whatsapp-notify');
      const wa = await notifyWhatsAppPaid({
        orderId,
        phone: fullOrder.buyerPhone,
        buyerName: fullOrder.buyerName,
        email: fullOrder.buyerEmail,
        accessCode: fullOrder.accessCode,
        eventTitle: fullOrder.event?.title,
      });
      if (!wa.ok && !wa.skipped) {
        console.error('[FINALIZE] whatsapp notify falhou:', wa.error);
      }
    } catch (e) {
      console.error('[FINALIZE] whatsapp notify exception:', e);
    }
  }

  try {
    const { performAutomaticVirada } = await import('@/lib/lote-virada');
    await performAutomaticVirada(order.eventId);
  } catch (e) {
    console.error('[FINALIZE] virada automática falhou:', e);
  }

  console.log(`[FINALIZE] paid ${orderId}`);
  return { ok: true };
}
