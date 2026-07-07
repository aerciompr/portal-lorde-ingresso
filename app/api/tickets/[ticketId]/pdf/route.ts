import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateTicketPDF } from '@/lib/generate-ticket';
import { formatDate } from '@/lib/utils';

export async function GET(_: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      order: { include: { event: true } },
      ticketType: true,
    },
  });

  if (!ticket || ticket.status !== 'valid') {
    return new NextResponse('Ingresso inválido ou utilizado', { status: 404 });
  }

  const pdfBytes = await generateTicketPDF({
    eventTitle: ticket.order.event.title,
    eventDate: formatDate(ticket.order.event.date) + ' • ' + (ticket.order.event.openTime || ''),
    buyerName: ticket.order.buyerName,
    buyerEmail: ticket.order.buyerEmail,
    ticketType: ticket.ticketType.name,
    uniqueCode: ticket.uniqueCode,
    qrPayload: ticket.qrPayload,
    address: ticket.order.event.address,
    priceCents: ticket.ticketType.priceCents,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ingresso-${ticket.uniqueCode}.pdf"`,
    },
  });
}
