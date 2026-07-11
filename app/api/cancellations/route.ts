import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertOrderOwnership } from '@/lib/request-security';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Solicitar cancelamento — exige prova de dono (código LN ou senha).
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rl = rateLimit({ key: `cancel:${ip}`, limit: 20, windowMs: 15 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Muitas solicitações. Aguarde e tente de novo.' },
      { status: 429 }
    );
  }

  let body: {
    orderId?: string;
    reason?: string;
    code?: string;
    password?: string;
    email?: string;
    cpf?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const orderId = (body.orderId || '').trim();
  const reason = (body.reason || '').trim();
  if (!orderId || reason.length < 3) {
    return NextResponse.json(
      { error: 'Informe o pedido e um motivo (mín. 3 caracteres)' },
      { status: 400 }
    );
  }

  const owned = await assertOrderOwnership({
    orderId,
    accessCode: body.code,
    password: body.password,
    email: body.email,
    cpf: body.cpf,
  });
  if (!owned.ok) return owned.response;

  const order = owned.order;
  if (order.status !== 'paid') {
    return NextResponse.json({ error: 'Pedido não elegível' }, { status: 400 });
  }

  const pending = order.cancellationRequests?.some(
    (c) => c.status === 'pending' || c.status === 'approved'
  );
  if (pending) {
    return NextResponse.json(
      { error: 'Já existe uma solicitação de cancelamento em andamento' },
      { status: 400 }
    );
  }

  const hours = order.event.cancelHoursBefore;
  const eventDate = new Date(order.event.date);
  const diffHours = (eventDate.getTime() - Date.now()) / (1000 * 3600);

  if (!order.event.allowCancel || diffHours < hours) {
    return NextResponse.json(
      { error: `Cancelamento só permitido até ${hours}h antes do evento` },
      { status: 400 }
    );
  }

  await prisma.cancellationRequest.create({
    data: { orderId, reason: reason.slice(0, 2000) },
  });

  return NextResponse.json({ success: true });
}
