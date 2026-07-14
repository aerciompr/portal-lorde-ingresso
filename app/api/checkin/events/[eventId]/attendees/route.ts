import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertCheckinStaff } from '@/lib/checkin-staff';

/**
 * GET /api/checkin/events/[eventId]/attendees?q=
 * Participantes (tickets paid) com busca por nome/e-mail/cpf/códigos.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const gate = assertCheckinStaff(req);
  if (gate !== true) return gate;

  const { eventId } = await params;
  if (!eventId) {
    return NextResponse.json({ error: 'eventId obrigatório' }, { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      date: true,
      openTime: true,
      address: true,
      imageUrl: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const statusFilter = (req.nextUrl.searchParams.get('status') || 'all').toLowerCase();

  const tickets = await prisma.ticket.findMany({
    where: {
      status: { in: ['valid', 'used'] },
      order: { eventId, status: 'paid' },
    },
    orderBy: [{ status: 'asc' }, { uniqueCode: 'asc' }],
    take: 500,
    select: {
      id: true,
      uniqueCode: true,
      status: true,
      checkedInAt: true,
      checkedInBy: true,
      ticketType: { select: { name: true } },
      order: {
        select: {
          id: true,
          buyerName: true,
          buyerEmail: true,
          buyerCpf: true,
          accessCode: true,
        },
      },
    },
  });

  let list = tickets.map((t) => ({
    ticketId: t.id,
    uniqueCode: t.uniqueCode,
    status: t.status,
    checkedInAt: t.checkedInAt,
    checkedInBy: t.checkedInBy,
    ticketTypeName: t.ticketType.name,
    buyerName: t.order.buyerName,
    buyerEmail: t.order.buyerEmail,
    buyerCpf: t.order.buyerCpf,
    accessCode: t.order.accessCode,
    orderId: t.order.id,
  }));

  if (statusFilter === 'valid' || statusFilter === 'used') {
    list = list.filter((t) => t.status === statusFilter);
  }

  if (q) {
    const digits = q.replace(/\D/g, '');
    list = list.filter((t) => {
      const name = (t.buyerName || '').toLowerCase();
      const email = (t.buyerEmail || '').toLowerCase();
      const cpf = (t.buyerCpf || '').replace(/\D/g, '');
      const code = (t.uniqueCode || '').toLowerCase();
      const access = (t.accessCode || '').toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        code.includes(q) ||
        access.includes(q) ||
        (digits.length >= 3 && cpf.includes(digits))
      );
    });
  }

  const total = tickets.length;
  const checkedIn = tickets.filter((t) => t.status === 'used').length;

  return NextResponse.json({
    event,
    stats: {
      total,
      checkedIn,
      notCheckedIn: Math.max(0, total - checkedIn),
    },
    attendees: list,
  });
}
