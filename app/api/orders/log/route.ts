import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logOrderEvent } from '@/lib/order-log';
import { rateLimit } from '@/lib/rate-limit';

/**
 * POST — log de erro no cliente (cartão recusado, 3DS, etc.)
 * Body: { orderId, kind?, title?, detail?, code? }
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit({
    key: `order-log:${req.headers.get('x-forwarded-for') || 'ip'}`,
    limit: 40,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate limit' }, { status: 429 });
  }

  let body: {
    orderId?: string;
    kind?: string;
    title?: string;
    detail?: string;
    code?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const orderId = String(body.orderId || '').trim();
  if (!orderId) {
    return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  }

  const kind = body.kind === 'note' ? 'note' : 'client_error';
  const title = (body.title || 'Erro no checkout (cliente)').slice(0, 255);
  const detail = [body.detail, body.code && `code=${body.code}`]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 2000);

  await logOrderEvent(orderId, kind, title, detail || null, {
    code: body.code || null,
    status: order.status,
  });

  return NextResponse.json({ ok: true });
}
