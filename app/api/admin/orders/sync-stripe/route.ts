import { NextRequest, NextResponse } from 'next/server';
import { requireAdminMutation } from '@/lib/request-security';
import { isAdmin } from '@/lib/auth';
import {
  reconcileAllPendingStripe,
  reconcileStripeOrder,
} from '@/lib/stripe-reconcile';

/**
 * POST — reconcilia pedidos pending com Stripe (PaymentIntent succeeded → paid).
 * Body opcional: { orderId?: string }
 * Sem orderId: varre pendentes com pi_ (últimos 7 dias).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  let body: { orderId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.orderId) {
    const r = await reconcileStripeOrder(String(body.orderId));
    return NextResponse.json({
      success: r.ok,
      ...r,
      message: r.finalized
        ? 'Pedido marcado como pago (Stripe confirmou)'
        : r.alreadyPaid
          ? 'Já estava pago'
          : r.stripeStatus
            ? `Stripe: ${r.stripeStatus}`
            : r.error || 'Sem mudança',
    });
  }

  const batch = await reconcileAllPendingStripe(100);
  return NextResponse.json({
    success: true,
    ...batch,
    message:
      batch.finalized > 0
        ? `${batch.finalized} pedido(s) confirmado(s) via Stripe (${batch.checked} verificados)`
        : `Nenhum novo pago. Verificados: ${batch.checked}`,
  });
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const batch = await reconcileAllPendingStripe(100);
  return NextResponse.json({
    success: true,
    ...batch,
    message:
      batch.finalized > 0
        ? `${batch.finalized} pedido(s) confirmado(s)`
        : `Nenhum novo. Verificados: ${batch.checked}`,
  });
}
