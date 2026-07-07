import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { orderId, reason } = await req.json();
  if (!orderId || !reason) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { event: true } });
  if (!order || order.status !== 'paid') {
    return NextResponse.json({ error: 'Pedido não elegível' }, { status: 400 });
  }

  const hours = order.event.cancelHoursBefore;
  const eventDate = new Date(order.event.date);
  const now = new Date();
  const diffHours = (eventDate.getTime() - now.getTime()) / (1000 * 3600);

  if (!order.event.allowCancel || diffHours < hours) {
    return NextResponse.json({ error: `Cancelamento só permitido até ${hours}h antes do evento` }, { status: 400 });
  }

  await prisma.cancellationRequest.create({
    data: { orderId, reason },
  });

  return NextResponse.json({ success: true });
}
