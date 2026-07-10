import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { createAdminOrder } from '@/lib/order-stock';
import { parseBRLToCents } from '@/lib/utils';

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const kind = body.kind === 'courtesy' ? 'courtesy' : 'manual';

    const order = await createAdminOrder({
      kind,
      eventId: body.eventId,
      ticketTypeId: body.ticketTypeId,
      quantity: Number(body.quantity) || 1,
      buyerName: body.buyerName || (kind === 'courtesy' ? 'Cortesia' : ''),
      buyerEmail: body.buyerEmail || '',
      buyerCpf: body.buyerCpf,
      buyerPhone: body.buyerPhone,
      unitPriceCents:
        body.unitPriceCents != null
          ? Math.round(Number(body.unitPriceCents))
          : body.priceReais != null
            ? parseBRLToCents(body.priceReais)
            : undefined,
      notes: body.notes,
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      accessCode: order.accessCode,
      totalCents: order.totalCents,
      ticketCount: order.tickets.length,
      tickets: order.tickets.map((t) => ({
        id: t.id,
        uniqueCode: t.uniqueCode,
        ticketType: t.ticketType?.name,
      })),
      message:
        kind === 'courtesy'
          ? 'Cortesia gerada com sucesso'
          : 'Pedido manual criado e pago',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar pedido';
    console.error('[ADMIN MANUAL ORDER]', e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
