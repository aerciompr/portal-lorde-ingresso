import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateUniqueCode } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { eventId, items, promoCode } = await req.json(); // items: [{ticketTypeId, quantity}]

    if (!eventId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({ 
      where: { id: eventId }, 
      include: { 
        ticketTypes: true,
        activeLote: true,
      } 
    });
    if (!event) return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });

    // Calculate + stock check in transaction style (simple for MVP)
    let totalCents = 0;
    const orderItems: { ticketTypeId: string; quantity: number; priceCents: number }[] = [];

    const currentPrice = event.activeLote?.precoCents;
    const loteAvail = event.activeLote
      ? Math.max(0, event.activeLote.totalQty - event.activeLote.sold)
      : null;
    let qtyTotal = 0;
    for (const item of items) {
      const tt = event.ticketTypes.find((t: { id: string }) => t.id === item.ticketTypeId);
      if (!tt) throw new Error('Tipo de ingresso inválido');
      const typeAvail = Math.max(0, tt.totalQty - tt.sold);
      // Com lote ativo, o limite é o menor entre tipo e vagas do lote
      const avail = loteAvail != null ? Math.min(typeAvail, loteAvail - qtyTotal) : typeAvail;
      if (item.quantity > avail || item.quantity < 1) {
        return NextResponse.json(
          {
            error:
              loteAvail != null && loteAvail < 1
                ? 'Lote ativo esgotado'
                : `Estoque insuficiente para ${tt.name}`,
          },
          { status: 400 }
        );
      }
      qtyTotal += item.quantity;
      const price = currentPrice ?? tt.priceCents;
      const lineTotal = price * item.quantity;
      totalCents += lineTotal;
      orderItems.push({ ticketTypeId: tt.id, quantity: item.quantity, priceCents: price });
    }

    const activeLoteId = event.activeLote?.id;

    // Cupom opcional (Settings: promo_code, promo_percent, promo_active)
    const { applyPromoCode } = await import('@/lib/promo');
    const promo = await applyPromoCode(totalCents, promoCode);
    totalCents = promo.totalCents;

    // Create pending order + tickets (will be finalized on payment success)
    // Placeholder evita "pedido fantasma" sem rótulo no admin
    const order = await prisma.order.create({
      data: {
        eventId,
        buyerName: 'Checkout em andamento',
        buyerEmail: '',
        totalCents,
        status: 'pending',
        feeDetails: promo.applied
          ? `cupom ${promo.applied} (-${promo.discountCents} centavos)`
          : undefined,
        loteId: activeLoteId,
        tickets: {
          create: orderItems.flatMap(item =>
            Array.from({ length: item.quantity }).map(() => ({
              ticketTypeId: item.ticketTypeId,
              uniqueCode: generateUniqueCode(),
              qrPayload: '', // filled on payment confirm
              status: 'valid',
            }))
          ),
        },
      },
      include: { tickets: true },
    });

    // Update sold counts (optimistic for pending - can be rolled back on abandon but ok for MVP)
    for (const item of orderItems) {
      await prisma.ticketType.update({
        where: { id: item.ticketTypeId },
        data: { sold: { increment: item.quantity } },
      });
    }

    if (activeLoteId) {
      await prisma.lote.update({
        where: { id: activeLoteId },
        data: { sold: { increment: items.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0) } },
      });
    }

    // Se o lote encheu com esta reserva, vira automaticamente o próximo
    try {
      const { performAutomaticVirada } = await import('@/lib/lote-virada');
      await performAutomaticVirada(eventId);
    } catch (e) {
      console.error('[CREATE ORDER] virada automática falhou', e);
    }

    const { logOrderEvent } = await import('@/lib/order-log');
    await logOrderEvent(
      order.id,
      'created',
      'Checkout iniciado',
      `${orderItems.reduce((s, i) => s + i.quantity, 0)} ingresso(s) · ${totalCents} centavos · evento ${event.title}`,
      {
        eventId,
        loteId: activeLoteId,
        items: orderItems.map((i) => ({
          ticketTypeId: i.ticketTypeId,
          quantity: i.quantity,
          priceCents: i.priceCents,
        })),
        promo: promo.applied || null,
      }
    );

    return NextResponse.json({
      orderId: order.id,
      totalCents,
      promoApplied: promo.applied,
      discountCents: promo.discountCents,
    });
  } catch (e: unknown) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
