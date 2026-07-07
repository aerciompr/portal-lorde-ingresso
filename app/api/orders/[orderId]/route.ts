import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      event: { select: { title: true, date: true } },
      tickets: { select: { id: true } },
    },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(order);
}
