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
  const fee = Math.round(order.totalCents * feeInfo.percent / 100) + feeInfo.fixedCents;

  const updateData: Record<string, unknown> = {
    status: 'paid',
    paidAt: new Date(),
    grossCents: order.totalCents,
    netCents: order.totalCents - fee,
    feeCents: fee,
    feeDetails: feeInfo.details,
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
    include: { tickets: { include: { ticketType: true } }, event: true },
  });

  if (fullOrder) {
    try {
      await sendOrderConfirmation(fullOrder as unknown as import('@/lib/email').OrderWithDetails);
    } catch (e) {
      console.error('[FINALIZE] e-mail falhou (pedido já está pago):', e);
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
