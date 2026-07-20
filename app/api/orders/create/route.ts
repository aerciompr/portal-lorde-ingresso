import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateUniqueCode } from '@/lib/utils';
import { withDbRetry } from '@/lib/db-retry';

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
    const hasActiveLote = Boolean(event.activeLote?.id && event.activeLote.ativo);
    // Com lote ativo: estoque do LOTE manda (não sync de TicketType no hot path — evita 1205)
    const loteAvail = hasActiveLote
      ? Math.max(0, event.activeLote!.totalQty - event.activeLote!.sold)
      : null;

    let qtyTotal = 0;
    for (const item of items) {
      const tt = event.ticketTypes.find((t: { id: string }) => t.id === item.ticketTypeId);
      if (!tt) throw new Error('Tipo de ingresso inválido');

      // Com lote: só o restante do lote limita a venda
      const typeAvail = Math.max(0, tt.totalQty - tt.sold);
      const avail =
        loteAvail != null ? Math.max(0, loteAvail - qtyTotal) : typeAvail;

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

      // Self-heal totalQty só SEM lote (com lote o sold++ do tipo não bloqueia venda)
      if (!hasActiveLote && tt.sold + item.quantity > tt.totalQty) {
        const newTotal = tt.sold + item.quantity;
        await withDbRetry(
          () =>
            prisma.ticketType.update({
              where: { id: tt.id },
              data: { totalQty: newTotal },
            }),
          { label: 'ticketType.totalQty self-heal' }
        );
        tt.totalQty = newTotal;
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

    const qtyReserved = orderItems.reduce((s, i) => s + i.quantity, 0);

    // Estoque: lote primeiro (fonte da verdade); TicketType com retry (pode contender)
    if (activeLoteId) {
      await withDbRetry(
        () =>
          prisma.lote.update({
            where: { id: activeLoteId },
            data: { sold: { increment: qtyReserved } },
          }),
        { label: 'lote.sold++' }
      );
    }

    for (const item of orderItems) {
      await withDbRetry(
        () =>
          prisma.ticketType.update({
            where: { id: item.ticketTypeId },
            data: { sold: { increment: item.quantity } },
          }),
        { label: `ticketType.sold++ ${item.ticketTypeId}` }
      );
    }

    // Low-stock e virada: fora do caminho crítico (pay + cron já viram; e-mail não segura lock)
    if (activeLoteId) {
      const loteIdForAlert = activeLoteId;
      setImmediate(() => {
        void import('@/lib/lote-stock-alerts')
          .then(({ checkLoteLowStockAlert }) => checkLoteLowStockAlert(loteIdForAlert))
          .catch((e) => console.error('[CREATE ORDER] lote low-stock (async)', e));
      });
    }
    // Virada automática: finalize-paid + cron — não no create (evita cascade de UPDATE)

    const { logOrderEvent } = await import('@/lib/order-log');
    await logOrderEvent(
      order.id,
      'created',
      'Checkout iniciado',
      `${qtyReserved} ingresso(s) · ${totalCents} centavos · evento ${event.title}`,
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
