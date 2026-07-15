import { prisma } from '@/lib/prisma';

export type OrderLogKind =
  | 'created'
  | 'pay_start'
  | 'pay_ok'
  | 'pay_error'
  | 'paid'
  | 'email'
  | 'email_fail'
  | 'cancelled'
  | 'refunded'
  | 'client_error'
  | 'note'
  | 'stock'
  | 'sync';

/**
 * Grava evento no histórico do pedido (não lança — nunca quebra o fluxo principal).
 */
export async function logOrderEvent(
  orderId: string,
  kind: OrderLogKind | string,
  title: string,
  detail?: string | null,
  meta?: Record<string, unknown> | null
): Promise<void> {
  if (!orderId) return;
  try {
    await prisma.orderLog.create({
      data: {
        orderId,
        kind: String(kind).slice(0, 48),
        title: String(title || kind).slice(0, 255),
        detail: detail ? String(detail).slice(0, 4000) : null,
        meta: meta ? JSON.stringify(meta).slice(0, 4000) : null,
      },
    });
  } catch (e) {
    console.warn('[ORDER LOG]', orderId, kind, (e as Error).message);
  }
}
