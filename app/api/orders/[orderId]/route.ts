import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

/**
 * Checkout carrega pedido pendente por id (cuid).
 * - pending: só dados necessários ao pagamento (sem PII de outros)
 * - paid/refunded: só com ?code=LN-… do pedido, ou admin
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  if (!orderId || orderId.length < 10) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      event: { select: { title: true, date: true } },
      tickets: { select: { id: true } },
    },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = (order.status || '').toLowerCase();
  const admin = await isAdmin();
  const code = (req.nextUrl.searchParams.get('code') || '').toUpperCase().trim();

  const promoFields = {
    discountCents: (order as { discountCents?: number }).discountCents || 0,
    promoCodeLabel: (order as { promoCodeLabel?: string | null }).promoCodeLabel || null,
  };

  if (status === 'pending') {
    // Público mínimo para checkout
    return NextResponse.json({
      id: order.id,
      totalCents: order.totalCents,
      status: order.status,
      event: order.event,
      tickets: order.tickets.map((t) => ({ id: t.id })),
      accessCode: order.accessCode,
      buyerEmail: order.buyerEmail || undefined,
      buyerName: order.buyerName || undefined,
      ...promoFields,
    });
  }

  if (admin) {
    return NextResponse.json({
      id: order.id,
      totalCents: order.totalCents,
      status: order.status,
      event: order.event,
      tickets: order.tickets.map((t) => ({ id: t.id })),
      accessCode: order.accessCode,
      buyerEmail: order.buyerEmail,
      buyerName: order.buyerName,
      ...promoFields,
    });
  }

  if (
    code &&
    order.accessCode &&
    code === order.accessCode.toUpperCase()
  ) {
    return NextResponse.json({
      id: order.id,
      totalCents: order.totalCents,
      status: order.status,
      event: order.event,
      tickets: order.tickets.map((t) => ({ id: t.id })),
      accessCode: order.accessCode,
      buyerEmail: order.buyerEmail,
      buyerName: order.buyerName,
      ...promoFields,
    });
  }

  return NextResponse.json(
    { error: 'Não autorizado a ver este pedido' },
    { status: 403 }
  );
}
