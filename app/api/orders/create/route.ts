import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateUniqueCode } from '@/lib/utils';

export async function POST(req: NextRequest) {
  let reservedPromoId: string | null = null;
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
      },
    });
    if (!event) return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });

    let subtotalCents = 0;
    const orderItems: { ticketTypeId: string; quantity: number; priceCents: number }[] = [];
    const unitPricesCents: number[] = [];

    const currentPrice = event.activeLote?.precoCents;
    const loteAvail = event.activeLote
      ? Math.max(0, event.activeLote.totalQty - event.activeLote.sold)
      : null;
    let qtyTotal = 0;
    for (const item of items) {
      const tt = event.ticketTypes.find((t: { id: string }) => t.id === item.ticketTypeId);
      if (!tt) throw new Error('Tipo de ingresso inválido');
      const typeAvail = Math.max(0, tt.totalQty - tt.sold);
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
      subtotalCents += price * item.quantity;
      orderItems.push({ ticketTypeId: tt.id, quantity: item.quantity, priceCents: price });
      for (let i = 0; i < item.quantity; i++) unitPricesCents.push(price);
    }

    const activeLoteId = event.activeLote?.id;

    const { applyAndReservePromo, createPromoRedemption } = await import('@/lib/promo');
    const promo = await applyAndReservePromo({
      code: promoCode,
      eventId,
      unitPricesCents,
    });

    // Cupom informado mas inválido → bloqueia (evita comprar achando que tinha desconto)
    if (promoCode && String(promoCode).trim() && !promo.applied) {
      const errMsg =
        'error' in promo && promo.error ? promo.error : 'Cupom inválido';
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    if (promo.promoCodeId) reservedPromoId = promo.promoCodeId;
    const totalCents = promo.totalCents;

    const orderData: Record<string, unknown> = {
      eventId,
      buyerName: 'Checkout em andamento',
      buyerEmail: '',
      totalCents,
      status: 'pending',
      feeDetails: promo.applied
        ? `cupom ${promo.applied} (-${promo.discountCents} centavos)`
        : undefined,
      loteId: activeLoteId,
      discountCents: promo.discountCents || 0,
      tickets: {
        create: orderItems.flatMap((item) =>
          Array.from({ length: item.quantity }).map(() => ({
            ticketTypeId: item.ticketTypeId,
            uniqueCode: generateUniqueCode(),
            qrPayload: '',
            status: 'valid',
          }))
        ),
      },
    };

    if (promo.promoCodeId) {
      orderData.promoCodeId = promo.promoCodeId;
      orderData.promoCodeLabel = promo.applied;
    } else if (promo.applied) {
      // legado sem tabela / sem id
      orderData.promoCodeLabel = promo.applied;
    }

    let order;
    try {
      order = await prisma.order.create({
        data: orderData as Parameters<typeof prisma.order.create>[0]['data'],
        include: { tickets: true },
      });
    } catch (e) {
      // Colunas promo podem não existir ainda — tenta sem elas
      const msg = e instanceof Error ? e.message : '';
      if (
        msg.includes('promoCode') ||
        msg.includes('discountCents') ||
        msg.includes('Unknown argument') ||
        msg.includes('P2022')
      ) {
        order = await prisma.order.create({
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
              create: orderItems.flatMap((item) =>
                Array.from({ length: item.quantity }).map(() => ({
                  ticketTypeId: item.ticketTypeId,
                  uniqueCode: generateUniqueCode(),
                  qrPayload: '',
                  status: 'valid',
                }))
              ),
            },
          },
          include: { tickets: true },
        });
      } else {
        throw e;
      }
    }

    if (promo.promoCodeId) {
      await createPromoRedemption({
        promoCodeId: promo.promoCodeId,
        orderId: order.id,
        discountCents: promo.discountCents,
        ticketQty: promo.ticketQty,
      });
    }
    reservedPromoId = null; // amarrado ao order

    for (const item of orderItems) {
      await prisma.ticketType.update({
        where: { id: item.ticketTypeId },
        data: { sold: { increment: item.quantity } },
      });
    }

    if (activeLoteId) {
      await prisma.lote.update({
        where: { id: activeLoteId },
        data: {
          sold: {
            increment: items.reduce(
              (s: number, i: { quantity: number }) => s + i.quantity,
              0
            ),
          },
        },
      });
      // Alerta e-mail se restam ≤2 no lote
      try {
        const { checkLoteLowStockAlert } = await import('@/lib/lote-stock-alerts');
        await checkLoteLowStockAlert(activeLoteId);
      } catch (e) {
        console.error('[CREATE ORDER] lote low-stock alert falhou', e);
      }
    }

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
        discountCents: promo.discountCents || 0,
        subtotalCents,
      }
    );

    return NextResponse.json({
      orderId: order.id,
      totalCents,
      subtotalCents,
      promoApplied: promo.applied,
      discountCents: promo.discountCents,
    });
  } catch (e: unknown) {
    if (reservedPromoId) {
      try {
        await prisma.promoCode.update({
          where: { id: reservedPromoId },
          data: { reservedUses: { decrement: 1 } },
        });
      } catch {
        /* ignore */
      }
    }
    console.error(e);
    const msg = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
