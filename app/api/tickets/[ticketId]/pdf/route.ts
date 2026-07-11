import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateTicketPDF, generateRefundReceiptPDF } from '@/lib/generate-ticket';
import { formatDate } from '@/lib/utils';
import { isAdmin } from '@/lib/auth';
import { signCode } from '@/lib/validate-ticket';

export async function GET(_: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const admin = await isAdmin();

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      order: { include: { event: true, lote: true, tickets: true } },
      ticketType: true,
    },
  });

  if (!ticket) {
    return new NextResponse('Ingresso não encontrado', { status: 404 });
  }

  const orderStatus = (ticket.order.status || '').toLowerCase();

  // ── Estorno: comprovante (sem QR de entrada) ──
  if (orderStatus === 'refunded') {
    const feePercent = ticket.order.event?.cancelFeePercent ?? 0;
    const refundCents = Math.round(ticket.order.totalCents * (1 - feePercent / 100));
    const codes = (ticket.order.tickets || []).map((t) => t.uniqueCode);

    const pdfBytes = await generateRefundReceiptPDF({
      eventTitle: ticket.order.event.title,
      eventDate:
        formatDate(ticket.order.event.date) +
        (ticket.order.event.openTime ? ` • ${ticket.order.event.openTime}` : ''),
      buyerName: ticket.order.buyerName,
      buyerEmail: ticket.order.buyerEmail,
      orderId: ticket.order.id,
      accessCode: ticket.order.accessCode,
      totalCents: ticket.order.totalCents,
      refundCents,
      ticketCodes: codes,
      feeDetails: ticket.order.feeDetails,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="estorno-${ticket.uniqueCode}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Público: só ingresso válido de pedido pago
  if (!admin) {
    if (orderStatus !== 'paid' || ticket.status !== 'valid') {
      return new NextResponse(
        'Ingresso inválido, utilizado ou cancelado. Pedidos estornados usam o comprovante de estorno.',
        { status: 404 }
      );
    }
  } else if (orderStatus !== 'paid') {
    return new NextResponse('PDF de entrada só para pedidos pagos', { status: 400 });
  }

  const qrPayload = ticket.qrPayload || signCode(ticket.uniqueCode);

  const pdfBytes = await generateTicketPDF({
    eventTitle: ticket.order.event.title,
    eventDate: formatDate(ticket.order.event.date) + ' • ' + (ticket.order.event.openTime || ''),
    buyerName: ticket.order.buyerName,
    buyerEmail: ticket.order.buyerEmail,
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
