import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { calcLoyaltyRefundCents } from '@/lib/loyalty-refund';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/loyalty/cancellation-request
 * Solicitar cancelamento do clube — auth leve por membershipId + cardCode
 * (mesmo padrão de /api/loyalty/billing-portal e do PDF do cartão).
 * Não cancela nada ainda — cria a solicitação pending pro admin aprovar/recusar
 * (fluxo espelha app/api/cancellations/route.ts, dos ingressos).
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rl = rateLimit({ key: `loyalty-cancel:${ip}`, limit: 20, windowMs: 15 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Muitas solicitações. Aguarde e tente de novo.' },
      { status: 429 }
    );
  }

  let body: { membershipId?: string; code?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const membershipId = String(body.membershipId || '').trim();
  const code = String(body.code || '').toUpperCase().trim();
  const reason = String(body.reason || '').trim();

  if (!membershipId || !code) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: 'Informe um motivo (mín. 3 caracteres)' }, { status: 400 });
  }

  const membership = await prisma.loyaltyMembership.findUnique({
    where: { id: membershipId },
    include: { cancellationRequests: true },
  });
  if (!membership || membership.cardCode.toUpperCase() !== code) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  if (membership.status !== 'active') {
    return NextResponse.json(
      { error: 'Só é possível solicitar cancelamento de uma assinatura ativa' },
      { status: 400 }
    );
  }

  const pending = membership.cancellationRequests.some(
    (c) => c.status === 'pending' || c.status === 'approved'
  );
  if (pending) {
    return NextResponse.json(
      { error: 'Já existe uma solicitação de cancelamento em andamento' },
      { status: 400 }
    );
  }

  await prisma.loyaltyCancellationRequest.create({
    data: { membershipId, reason: reason.slice(0, 2000) },
  });

  const previewRefundCents = calcLoyaltyRefundCents(membership);

  return NextResponse.json({ success: true, previewRefundCents });
}
