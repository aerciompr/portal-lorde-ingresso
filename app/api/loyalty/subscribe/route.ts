import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStripeForLoyalty } from '@/lib/loyalty-stripe';
import { isValidCpf, isValidPhone, isValidCep, cleanCpf, cleanPhone, cleanCep } from '@/lib/masks';
import { generateUniqueCode } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/loyalty/subscribe
 * Cria a LoyaltyMembership (pending) + Stripe Checkout Session (mode: subscription)
 * e devolve a URL do checkout hospedado da Stripe.
 */
export async function POST(req: NextRequest) {
  let body: {
    planPriceId?: string;
    name?: string;
    email?: string;
    cpf?: string;
    phone?: string;
    birthDate?: string;
    zip?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    referralCode?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const planPriceId = String(body.planPriceId || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const cpf = body.cpf ? cleanCpf(String(body.cpf)) : '';
  const phone = body.phone ? cleanPhone(String(body.phone)) : '';
  const zip = body.zip ? cleanCep(String(body.zip)) : '';
  const street = String(body.street || '').trim();
  const number = String(body.number || '').trim();
  const complement = String(body.complement || '').trim();
  const neighborhood = String(body.neighborhood || '').trim();
  const city = String(body.city || '').trim();
  const state = String(body.state || '').trim().toUpperCase();

  let birthDate: Date | null = null;
  if (body.birthDate) {
    const d = new Date(body.birthDate);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Data de nascimento inválida' }, { status: 400 });
    }
    birthDate = d;
  }

  if (!planPriceId) return NextResponse.json({ error: 'planPriceId obrigatório' }, { status: 400 });
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
  if (zip && !isValidCep(zip)) {
    return NextResponse.json({ error: 'CEP inválido' }, { status: 400 });
  }

  const planPrice = await prisma.loyaltyPlanPrice.findUnique({
    where: { id: planPriceId },
    include: { plan: true },
  });
  if (!planPrice || !planPrice.active || !planPrice.plan.active) {
    return NextResponse.json({ error: 'Periodicidade não encontrada ou inativa' }, { status: 404 });
  }
  if (!planPrice.stripePriceId) {
    return NextResponse.json(
      { error: 'Periodicidade ainda não está configurada para cobrança (falta Stripe Price ID no admin)' },
      { status: 400 }
    );
  }
  const plan = planPrice.plan;

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

  // Código de indicação (opcional) — quem indicou ganha crédito na próxima fatura
  // quando ESTE sócio pagar a 1ª fatura (ver handleLoyaltyInvoicePaid no webhook).
  let referredById: string | null = null;
  const referralCode = String(body.referralCode || '').toUpperCase().trim();
  if (referralCode) {
    const referrer = await prisma.loyaltyMembership.findUnique({
      where: { cardCode: referralCode },
    });
    if (referrer && referrer.buyerEmail.toLowerCase() !== email) {
      referredById = referrer.id;
    }
  }

  const membership = await prisma.loyaltyMembership.create({
    data: {
      planId: plan.id,
      planPriceId: planPrice.id,
      cardCode,
      buyerName: name,
      buyerEmail: email,
      buyerCpf: cpf || null,
      buyerPhone: phone || null,
      buyerBirthDate: birthDate,
      buyerZip: zip || null,
      buyerStreet: street || null,
      buyerNumber: number || null,
      buyerComplement: complement || null,
      buyerNeighborhood: neighborhood || null,
      buyerCity: city || null,
      buyerState: state || null,
      referredById,
      status: 'pending',
    },
  });

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: planPrice.stripePriceId, quantity: 1 }],
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
