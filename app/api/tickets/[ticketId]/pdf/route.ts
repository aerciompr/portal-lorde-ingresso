import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateTicketPDF } from '@/lib/generate-ticket';
import { formatDate } from '@/lib/utils';
import { isAdmin } from '@/lib/auth';
import { signCode } from '@/lib/validate-ticket';

export async function GET(_: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const admin = await isAdmin();

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      order: { include: { event: true, lote: true } },
      ticketType: true,
    },
  });

  if (!ticket) {
    return new NextResponse('Ingresso não encontrado', { status: 404 });
  }

  // Público: só ingressos válidos. Admin: qualquer ingresso de pedido pago.
  if (!admin) {
    if (ticket.status !== 'valid') {
      return new NextResponse('Ingresso inválido ou utilizado', { status: 404 });
    }
  } else if (ticket.order.status !== 'paid') {
    return new NextResponse('PDF disponível apenas para pedidos pagos', { status: 400 });
  }

  const qrPayload = ticket.qrPayload || signCode(ticket.uniqueCode);

  const pdfBytes = await generateTicketPDF({
    eventTitle: ticket.order.event.title,
    eventDate: formatDate(ticket.order.event.date) + ' • ' + (ticket.order.event.openTime || ''),
    buyerName: ticket.order.buyerName,
    buyerEmail: ticket.order.buyerEmail,
    // Preferência: nome do lote (Lote Promocional, Lote 1…) em vez de "Ingresso Padrão"
    ticketType: ticket.order.lote?.nome || ticket.ticketType.name,
    uniqueCode: ticket.uniqueCode,
    qrPayload,
    address: ticket.order.event.address,
    priceCents: ticket.ticketType.priceCents,
    imageUrl: ticket.order.event.imageUrl,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ingresso-${ticket.uniqueCode}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
