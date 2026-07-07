import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPayload } from '@/lib/validate-ticket';

export async function POST(req: NextRequest) {
  // Protection: admin session (for staff via web) or API key
  const session = req.cookies.get('admin_session')?.value;
  const apiKeyHeader = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
  const apiKeyQuery = req.nextUrl.searchParams.get('key') || req.nextUrl.searchParams.get('api_key');
  const providedKey = apiKeyHeader || apiKeyQuery;

  const allowedApiKey = process.env.CHECKIN_API_KEY;

  const isStaff = session === '1';
  const isApiKeyValid = allowedApiKey && providedKey === allowedApiKey;

  if (!isStaff && !isApiKeyValid) {
    return NextResponse.json({ error: 'Não autorizado. Use login de funcionário ou API key.' }, { status: 401 });
  }

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 });

  const validCode = verifyPayload(code) || code;  // fallback plain code

  const ticket = await prisma.ticket.findFirst({
    where: {
      OR: [
        { uniqueCode: validCode },
        { qrPayload: code },
      ],
      status: 'valid',
    },
    include: { order: { include: { event: true } }, ticketType: true },
  });

  if (!ticket) return NextResponse.json({ error: 'Inválido ou usado' }, { status: 404 });

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'used', checkedInAt: new Date(), checkedInBy: isApiKeyValid ? 'api' : 'staff' },
  });

  return NextResponse.json({
    success: true,
    uniqueCode: ticket.uniqueCode,
    buyerName: ticket.order.buyerName,
    eventTitle: ticket.order.event.title,
  });
}
