import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/loyalty/membership
 * Body: { email, password }
 * Reaproveita a MESMA senha de conta de Meus Ingressos (Order.buyerPasswordHash do
 * mesmo e-mail — não cria login paralelo). Senha nunca via query string (POST only).
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit({
    key: `loyalty-membership:${req.headers.get('x-forwarded-for') || 'unknown'}`,
    limit: 40,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha obrigatórios' }, { status: 400 });
  }

  const candidates = await prisma.order.findMany({
    where: { buyerEmail: email, buyerPasswordHash: { not: null } },
    select: { buyerPasswordHash: true },
    take: 20,
  });

  let authorized = false;
  for (const c of candidates) {
    if (c.buyerPasswordHash && (await verifyPassword(password, c.buyerPasswordHash))) {
      authorized = true;
      break;
    }
  }
  if (!authorized) {
    return NextResponse.json({ error: 'E-mail ou senha inválidos' }, { status: 401 });
  }

  const membership = await prisma.loyaltyMembership.findFirst({
    where: { buyerEmail: email },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });

  if (!membership) {
    return NextResponse.json({ membership: null });
  }

  return NextResponse.json({
    membership: {
      id: membership.id,
      cardCode: membership.cardCode,
      status: membership.status,
      buyerName: membership.buyerName,
      entriesUsedInPeriod: membership.entriesUsedInPeriod,
      currentPeriodEnd: membership.currentPeriodEnd,
      hasStripeCustomer: Boolean(membership.stripeCustomerId),
      plan: {
        name: membership.plan.name,
        freeEntriesPerCycle: membership.plan.freeEntriesPerCycle,
        checkinsPerEntry: membership.plan.checkinsPerEntry,
        overageDiscountPercent: membership.plan.overageDiscountPercent,
      },
    },
  });
}
