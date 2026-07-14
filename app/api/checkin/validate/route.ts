import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPayload } from '@/lib/validate-ticket';
import { isStaffSession } from '@/lib/request-security';
import { assertCheckinStaff } from '@/lib/checkin-staff';

export async function POST(req: NextRequest) {
  const gate = assertCheckinStaff(req);
  if (gate !== true) return gate;

  const isStaff = isStaffSession(req);
  const apiKeyHeader =
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const isApiKeyValid = Boolean(
    process.env.CHECKIN_API_KEY &&
      (apiKeyHeader === process.env.CHECKIN_API_KEY ||
        req.nextUrl.searchParams.get('key') === process.env.CHECKIN_API_KEY)
  );

  let code = '';
  let ticketId = '';
  let eventId = '';
  try {
    const body = await req.json();
    code = String(body.code || '').trim();
    ticketId = String(body.ticketId || '').trim();
    eventId = String(body.eventId || '').trim();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!code && !ticketId) {
    return NextResponse.json({ error: 'Código ou ticketId obrigatório' }, { status: 400 });
  }

  const validCode = code ? verifyPayload(code) || code : '';

  let ticket = ticketId
    ? await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { order: { include: { event: true } }, ticketType: true },
      })
    : null;

  if (!ticket && validCode) {
    ticket = await prisma.ticket.findFirst({
      where: {
        OR: [{ uniqueCode: validCode }, { qrPayload: code }],
      },
      include: { order: { include: { event: true } }, ticketType: true },
    });
  }

  if (!ticket) {
    return NextResponse.json({ error: 'Inválido ou não encontrado' }, { status: 404 });
  }

  if (eventId && ticket.order.eventId !== eventId) {
    return NextResponse.json(
      {
        error: `Ingresso de outro evento: ${ticket.order.event?.title || '—'}`,
      },
      { status: 400 }
    );
  }

  // Só entrada de pedido pago
  if ((ticket.order.status || '').toLowerCase() !== 'paid') {
    return NextResponse.json(
      { error: 'Pedido não está pago — ingresso sem validade de entrada' },
      { status: 400 }
    );
  }

  if (ticket.status === 'used') {
    return NextResponse.json(
      {
        error: 'Já utilizado',
        alreadyUsed: true,
        uniqueCode: ticket.uniqueCode,
        buyerName: ticket.order.buyerName,
        eventTitle: ticket.order.event.title,
        checkedInAt: ticket.checkedInAt,
      },
      { status: 409 }
    );
  }

  if (ticket.status !== 'valid') {
    return NextResponse.json({ error: 'Ingresso cancelado ou inválido' }, { status: 400 });
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'used',
      checkedInAt: new Date(),
      checkedInBy: isApiKeyValid && !isStaff ? 'api' : 'staff',
    },
  });

  return NextResponse.json({
    success: true,
    ticketId: ticket.id,
    uniqueCode: ticket.uniqueCode,
    buyerName: ticket.order.buyerName,
    eventTitle: ticket.order.event.title,
    eventId: ticket.order.eventId,
    ticketTypeName: ticket.ticketType.name,
  });
}
