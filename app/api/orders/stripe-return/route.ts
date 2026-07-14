import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reconcileByPaymentIntent } from '@/lib/stripe-reconcile';

/**
 * GET ?payment_intent=pi_xxx
 * Chamado após redirect do Stripe (return_url) para marcar paid sem depender do webhook.
 */
export async function GET(req: NextRequest) {
  const pi =
    req.nextUrl.searchParams.get('payment_intent') ||
    req.nextUrl.searchParams.get('payment_intent_id') ||
    '';

  if (!pi || !pi.startsWith('pi_')) {
    return NextResponse.json({ error: 'payment_intent obrigatório' }, { status: 400 });
  }

  const r = await reconcileByPaymentIntent(pi);
  if (!r.ok) {
    return NextResponse.json(
      { success: false, error: r.error || 'Falha ao sincronizar', ...r },
      { status: 400 }
    );
  }

  let accessCode: string | null = null;
  let buyerEmail: string | null = null;
  let ticketIds: string[] = [];
  if (r.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: r.orderId },
      select: {
        accessCode: true,
        buyerEmail: true,
        status: true,
        tickets: { select: { id: true } },
      },
    });
    accessCode = order?.accessCode || null;
    buyerEmail = order?.buyerEmail || null;
    ticketIds = (order?.tickets || []).map((t) => t.id);
  }

  return NextResponse.json({
    success: true,
    status: r.status,
    orderId: r.orderId,
    accessCode,
    buyerEmail,
    ticketIds,
    message: r.status === 'paid' ? 'Pagamento confirmado' : 'Aguardando…',
  });
}
