import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStripeForLoyalty } from '@/lib/loyalty-stripe';
import { isValidCpf, isValidPhone, cleanCpf, cleanPhone } from '@/lib/masks';
import { generateUniqueCode } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/loyalty/subscribe
 * Cria a LoyaltyMembership (pending) + Stripe Checkout Session (mode: subscription)
 * e devolve a URL do checkout hospedado da Stripe.
 */
export async function POST(req: NextRequest) {
  let body: { planId?: string; name?: string; email?: string; cpf?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const planId = String(body.planId || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const cpf = body.cpf ? cleanCpf(String(body.cpf)) : '';
  const phone = body.phone ? cleanPhone(String(body.phone)) : '';

  if (!planId) return NextResponse.json({ error: 'planId obrigatório' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  }
  if (cpf && !isValidCpf(cpf)) {
    return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });
  }
  if (phone && !isValidPhone(phone)) {
    return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 });
  }

  const plan = await prisma.loyaltyPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.active) {
    return NextResponse.json({ error: 'Pacote não encontrado ou inativo' }, { status: 404 });
  }
  if (!plan.stripePriceId) {
    return NextResponse.json(
      { error: 'Pacote ainda não está configurado para cobrança (falta Stripe Price ID no admin)' },
      { status: 400 }
    );
  }

  const { stripe, useConnect, stripeAccountId, appUrl } = await getStripeForLoyalty();
  if (!stripe) {
    return NextResponse.json({ error: 'Pagamento não configurado' }, { status: 500 });
  }

  let cardCode = '';
  for (let i = 0; i < 5; i++) {
    const candidate = generateUniqueCode('FID');
    const exists = await prisma.loyaltyMembership.findUnique({ where: { cardCode: candidate } });
    if (!exists) {
      cardCode = candidate;
      break;
    }
  }
  if (!cardCode) {
    return NextResponse.json({ error: 'Falha ao gerar cartão, tente novamente' }, { status: 500 });
  }

  const membership = await prisma.loyaltyMembership.create({
    data: {
      planId: plan.id,
      cardCode,
      buyerName: name,
      buyerEmail: email,
      buyerCpf: cpf || null,
      buyerPhone: phone || null,
      status: 'pending',
    },
  });

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        customer_email: email,
        metadata: { membershipId: membership.id },
        subscription_data: { metadata: { membershipId: membership.id } },
        success_url: `${appUrl}/ingressos?assinatura=sucesso`,
        cancel_url: `${appUrl}/fidelidade`,
      },
      useConnect ? { stripeAccount: stripeAccountId } : undefined
    );

    if (!session.url) throw new Error('Stripe não retornou URL de checkout');

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[loyalty/subscribe]', e);
    await prisma.loyaltyMembership.delete({ where: { id: membership.id } }).catch(() => {});
    return NextResponse.json({ error: 'Falha ao iniciar checkout' }, { status: 500 });
  }
}
