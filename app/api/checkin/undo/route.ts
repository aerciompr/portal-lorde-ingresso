import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertCheckinStaff } from '@/lib/checkin-staff';
import { verifyPayload } from '@/lib/validate-ticket';

/**
 * POST /api/checkin/undo
 * body: { ticketId } | { code }
 * Reverte used → valid (QR volta a valer).
 */
export async function POST(req: NextRequest) {
  const gate = assertCheckinStaff(req);
  if (gate !== true) return gate;

  let ticketId = '';
  let code = '';
  try {
    const body = await req.json();
    ticketId = String(body.ticketId || '').trim();
    code = String(body.code || '').trim();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!ticketId && !code) {
    return NextResponse.json({ error: 'ticketId ou code obrigatório' }, { status: 400 });
  }

  let ticket = ticketId
    ? await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { order: { include: { event: true } }, ticketType: true },
      })
    : null;

  if (!ticket && code) {
    const validCode = verifyPayload(code) || code;
    ticket = await prisma.ticket.findFirst({
      where: {
        OR: [{ uniqueCode: validCode }, { qrPayload: code }, { id: code }],
      },
      include: { order: { include: { event: true } }, ticketType: true },
    });
  }

  if (!ticket) {
    return NextResponse.json({ error: 'Ingresso não encontrado' }, { status: 404 });
  }

  if ((ticket.order.status || '').toLowerCase() !== 'paid') {
    return NextResponse.json(
      { error: 'Pedido não está pago — não é possível reabrir entrada' },
      { status: 400 }
    );
  }

  if (ticket.status !== 'used') {
    return NextResponse.json(
      { error: 'Este ingresso não está com check-in feito' },
      { status: 400 }
    );
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'valid',
      checkedInAt: null,
      checkedInBy: null,
    },
  });

  return NextResponse.json({
    success: true,
    undone: true,
    ticketId: ticket.id,
    uniqueCode: ticket.uniqueCode,
    buyerName: ticket.order.buyerName,
    eventTitle: ticket.order.event.title,
    eventId: ticket.order.eventId,
  });
}
