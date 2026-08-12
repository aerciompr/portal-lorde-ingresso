import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import { getStripeForLoyalty } from '@/lib/loyalty-stripe';
import { calcLoyaltyRefundCents } from '@/lib/loyalty-refund';
import { sendLoyaltyCancellationApproved } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lista solicitações de cancelamento do clube (admin). */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get('status') || 'pending';
  const where = status === 'all' ? {} : { status };

  const items = await prisma.loyaltyCancellationRequest.findMany({
    where,
    orderBy: { requestedAt: 'desc' },
    take: 100,
    include: {
      membership: {
        include: { plan: true, planPrice: true },
      },
    },
  });

  const withPreview = items.map((i) => ({
    ...i,
    previewRefundCents:
      i.status === 'pending' ? calcLoyaltyRefundCents(i.membership) : i.refundCents,
  }));

  return NextResponse.json({ items: withPreview });
}

/**
 * Aprovar (estorno proporcional + cancela a assinatura) ou recusar solicitação.
 * body: { id, action: 'approve' | 'reject', adminNotes? }
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  const action = String(body.action || '');
  const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes.trim() : '';

  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id e action (approve|reject) obrigatórios' }, { status: 400 });
  }

  const cr = await prisma.loyaltyCancellationRequest.findUnique({
    where: { id },
    include: { membership: { include: { plan: true } } },
  });

  if (!cr) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
  if (cr.status !== 'pending') {
    return NextResponse.json({ error: `Solicitação já está: ${cr.status}` }, { status: 400 });
  }

  if (action === 'reject') {
    await prisma.loyaltyCancellationRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        processedAt: new Date(),
        adminNotes: adminNotes || 'Solicitação recusada pelo admin',
      },
    });
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  const membership = cr.membership;
  if (membership.status !== 'active') {
    await prisma.loyaltyCancellationRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        processedAt: new Date(),
        adminNotes: 'Assinatura não está mais ativa — não é possível processar',
      },
    });
    return NextResponse.json({ error: 'Assinatura não elegível para estorno' }, { status: 400 });
  }

  const refundCents = calcLoyaltyRefundCents(membership);

  const { stripe, useConnect, stripeAccountId } = await getStripeForLoyalty();
  if (!stripe) {
    return NextResponse.json({ error: 'Pagamento não configurado' }, { status: 500 });
  }
  if (refundCents > 0 && !membership.lastInvoicePaymentIntentId) {
    return NextResponse.json(
      {
        error:
          'Não foi possível identificar o pagamento da última fatura pra estornar. Resolva manualmente no Dashboard Stripe e recuse esta solicitação, registrando o estorno nas notas.',
      },
      { status: 400 }
    );
  }

  try {
    if (refundCents > 0 && membership.lastInvoicePaymentIntentId) {
      await stripe.refunds.create(
        { payment_intent: membership.lastInvoicePaymentIntentId, amount: refundCents },
        useConnect ? { stripeAccount: stripeAccountId } : undefined
      );
    }
    if (membership.stripeSubscriptionId) {
      await stripe.subscriptions
        .cancel(membership.stripeSubscriptionId, undefined, useConnect ? { stripeAccount: stripeAccountId } : undefined)
        .catch((e) => {
          // já pode estar cancelada (ex: cliente tentou pelo Billing Portal antes de desligarmos isso) — só loga
          console.warn('[loyalty-cancellations] subscriptions.cancel falhou (pode já estar cancelada)', e);
        });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[loyalty-cancellations] estorno Stripe falhou', msg);
    return NextResponse.json({ error: 'Falha ao estornar no Stripe: ' + msg }, { status: 500 });
  }

  await prisma.loyaltyMembership.update({
    where: { id: membership.id },
    data: { status: 'canceled', canceledAt: new Date() },
  });

  await prisma.loyaltyCancellationRequest.update({
    where: { id },
    data: {
      status: 'approved',
      refundCents,
      processedAt: new Date(),
      adminNotes:
        adminNotes ||
        `Aprovado. Reembolso ${(refundCents / 100).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })} (proporcional ao tempo restante do período pago).`,
    },
  });

  try {
    await sendLoyaltyCancellationApproved({
      to: membership.buyerEmail,
      buyerName: membership.buyerName,
      planName: membership.plan.name,
      refundCents,
    });
  } catch (e) {
    console.error('[loyalty-cancellations] e-mail falhou', e);
  }

  return NextResponse.json({ ok: true, status: 'approved', refundCents });
}
