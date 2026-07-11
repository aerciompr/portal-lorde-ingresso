import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPayload } from '@/lib/validate-ticket';
import { isStaffSession } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  const apiKeyHeader =
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const apiKeyQuery =
    req.nextUrl.searchParams.get('key') || req.nextUrl.searchParams.get('api_key');
  const providedKey = apiKeyHeader || apiKeyQuery;
  const allowedApiKey = process.env.CHECKIN_API_KEY;

  const isStaff = isStaffSession(req);
  const isApiKeyValid = Boolean(allowedApiKey && providedKey === allowedApiKey);

  if (!isStaff && !isApiKeyValid) {
    return NextResponse.json(
      { error: 'Não autorizado. Use login de funcionário ou API key.' },
      { status: 401 }
    );
  }

  let code = '';
  try {
    const body = await req.json();
    code = String(body.code || '').trim();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 });
  }

  const validCode = verifyPayload(code) || code;

  const ticket = await prisma.ticket.findFirst({
    where: {
      OR: [{ uniqueCode: validCode }, { qrPayload: code }],
      status: 'valid',
    },
    include: { order: { include: { event: true } }, ticketType: true },
  });

  if (!ticket) {
    return NextResponse.json({ error: 'Inválido ou usado' }, { status: 404 });
  }

  // Só entrada de pedido pago
  if ((ticket.order.status || '').toLowerCase() !== 'paid') {
    return NextResponse.json(
      { error: 'Pedido não está pago — ingresso sem validade de entrada' },
      { status: 400 }
    );
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'used',
      checkedInAt: new Date(),
      checkedInBy: isApiKeyValid ? 'api' : 'staff',
    },
  });

  return NextResponse.json({
    success: true,
    uniqueCode: ticket.uniqueCode,
    buyerName: ticket.order.buyerName,
    eventTitle: ticket.order.event.title,
  });
}
