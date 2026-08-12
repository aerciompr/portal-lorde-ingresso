import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStripeForLoyalty } from '@/lib/loyalty-stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/loyalty/billing-portal
 * Body: { membershipId, code }  (code = cardCode, mesma auth leve do PDF do cartão)
 * Cria uma sessão do Stripe Billing Portal pro sócio cancelar/trocar cartão sozinho.
 */
export async function POST(req: NextRequest) {
  let body: { membershipId?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const membershipId = String(body.membershipId || '').trim();
  const code = String(body.code || '').toUpperCase().trim();
  if (!membershipId || !code) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
  }

  const membership = await prisma.loyaltyMembership.findUnique({ where: { id: membershipId } });
  if (!membership || membership.cardCode.toUpperCase() !== code) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (!membership.stripeCustomerId) {
    return NextResponse.json(
      { error: 'Assinatura ainda não confirmada — aguarde a 1ª cobrança.' },
      { status: 400 }
    );
  }

  const { stripe, useConnect, stripeAccountId, appUrl } = await getStripeForLoyalty();
  if (!stripe) {
    return NextResponse.json({ error: 'Pagamento não configurado' }, { status: 500 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create(
      {
        customer: membership.stripeCustomerId,
        return_url: `${appUrl}/ingressos`,
      },
      useConnect ? { stripeAccount: stripeAccountId } : undefined
    );
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[loyalty/billing-portal]', e);
    return NextResponse.json({ error: 'Falha ao abrir portal de assinatura' }, { status: 500 });
  }
}
