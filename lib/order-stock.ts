import { prisma } from '@/lib/prisma';
import { generateUniqueCode } from '@/lib/utils';
import { signCode } from '@/lib/validate-ticket';

/**
 * Devolve ingressos de um pedido ao estoque (TicketType + Lote) e cancela os tickets.
 * Usado em limpeza de pendentes abandonados.
 */
export async function releaseOrderStock(orderId: string): Promise<{ ticketsReleased: number }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { tickets: true },
  });
  if (!order) return { ticketsReleased: 0 };

  // Contar por tipo de ingresso
  const byType: Record<string, number> = {};
  for (const t of order.tickets) {
    // Só devolve se ainda não estiver cancelado
    if (t.status === 'cancelled') continue;
    byType[t.ticketTypeId] = (byType[t.ticketTypeId] || 0) + 1;
  }

  const total = Object.values(byType).reduce((s, n) => s + n, 0);
  if (total === 0) {
    // Ainda marca pedido se necessário
    return { ticketsReleased: 0 };
  }

  for (const [ticketTypeId, qty] of Object.entries(byType)) {
    const tt = await prisma.ticketType.findUnique({ where: { id: ticketTypeId } });
    if (tt) {
      await prisma.ticketType.update({
        where: { id: ticketTypeId },
        data: { sold: Math.max(0, tt.sold - qty) },
      });
    }
  }

  if (order.loteId) {
    const lote = await prisma.lote.findUnique({ where: { id: order.loteId } });
    if (lote) {
      await prisma.lote.update({
        where: { id: order.loteId },
        data: { sold: Math.max(0, lote.sold - total) },
      });
    }
  }

  await prisma.ticket.updateMany({
    where: { orderId, status: { not: 'cancelled' } },
    data: { status: 'cancelled' },
  });

  return { ticketsReleased: total };
}

/**
 * Estorno de pedido **pago**:
 * - Se o lote da venda ainda está **ativo** → devolve sold no lote e no TicketType
 *   (alguém pode comprar de novo naquele lote).
 * - Se o lote já foi virado / **inativo** (encerrado) → **não** devolve ao lote
 *   (histórico do lote fechado permanece; não reabre vaga em lote esgotado).
 *
 * Idempotente: tickets já cancelled não contam de novo.
 */
export async function restoreStockOnRefund(orderId: string): Promise<{
  ticketsRestored: number;
  loteRestored: boolean;
  loteId: string | null;
  reason: string;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { tickets: true },
  });
  if (!order) {
    return { ticketsRestored: 0, loteRestored: false, loteId: null, reason: 'pedido não encontrado' };
  }

  // Conta tickets que ainda contavam como vendidos (não cancelados)
  const activeTickets = order.tickets.filter((t) => t.status !== 'cancelled');
  if (activeTickets.length === 0) {
    return {
      ticketsRestored: 0,
      loteRestored: false,
      loteId: order.loteId,
      reason: 'nenhum ticket ativo para devolver',
    };
  }

  const byType: Record<string, number> = {};
  for (const t of activeTickets) {
    byType[t.ticketTypeId] = (byType[t.ticketTypeId] || 0) + 1;
  }
  const total = activeTickets.length;

  // Cancela tickets (sempre no estorno)
  await prisma.ticket.updateMany({
    where: { orderId, status: { not: 'cancelled' } },
    data: { status: 'cancelled' },
  });

  if (!order.loteId) {
    // Pedido sem lote: devolve só TicketType
    for (const [ticketTypeId, qty] of Object.entries(byType)) {
      const tt = await prisma.ticketType.findUnique({ where: { id: ticketTypeId } });
      if (tt) {
        await prisma.ticketType.update({
          where: { id: ticketTypeId },
          data: { sold: Math.max(0, tt.sold - qty) },
        });
      }
    }
    return {
      ticketsRestored: total,
      loteRestored: false,
      loteId: null,
      reason: 'sem lote no pedido — devolveu TicketType',
    };
  }

  const lote = await prisma.lote.findUnique({ where: { id: order.loteId } });
  if (!lote) {
    return {
      ticketsRestored: 0,
      loteRestored: false,
      loteId: order.loteId,
      reason: 'lote não encontrado',
    };
  }

  if (!lote.ativo) {
    // Lote já virado / esgotado / inativo — não reabre vaga nesse lote
    console.log(
      `[STOCK] estorno ${orderId}: lote ${lote.nome} inativo — NÃO devolve sold (tickets cancelados)`
    );
    return {
      ticketsRestored: 0,
      loteRestored: false,
      loteId: lote.id,
      reason: `lote "${lote.nome}" inativo/encerrado — estoque do lote não alterado`,
    };
  }

  // Lote ainda ativo → devolve
  await prisma.lote.update({
    where: { id: lote.id },
    data: { sold: Math.max(0, lote.sold - total) },
  });

  for (const [ticketTypeId, qty] of Object.entries(byType)) {
    const tt = await prisma.ticketType.findUnique({ where: { id: ticketTypeId } });
    if (tt) {
      await prisma.ticketType.update({
        where: { id: ticketTypeId },
        data: { sold: Math.max(0, tt.sold - qty) },
      });
    }
  }

  console.log(
    `[STOCK] estorno ${orderId}: devolveu ${total} ao lote ativo "${lote.nome}"`
  );
  return {
    ticketsRestored: total,
    loteRestored: true,
    loteId: lote.id,
    reason: `devolvido ao lote ativo "${lote.nome}"`,
  };
}

export type AdminOrderKind = 'courtesy' | 'manual';

export type CreateAdminOrderInput = {
  kind: AdminOrderKind;
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  buyerName: string;
  buyerEmail: string;
  buyerCpf?: string;
  buyerPhone?: string;
  /** Preço unitário em centavos (manual). Cortesia ignora e usa 0. */
  unitPriceCents?: number;
  notes?: string;
};

/**
 * Cria pedido pago (cortesia R$0 ou manual) com tickets e QR já gerados, e reserva estoque.
 */
export async function createAdminOrder(input: CreateAdminOrderInput) {
  const qty = Math.max(1, Math.min(50, Math.floor(input.quantity || 1)));
  if (!input.eventId || !input.ticketTypeId) {
    throw new Error('Evento e tipo de ingresso são obrigatórios');
  }
  if (!input.buyerName?.trim()) {
    throw new Error('Nome do comprador é obrigatório');
  }
  if (!input.buyerEmail?.trim()?.includes('@')) {
    throw new Error('E-mail válido é obrigatório');
  }

  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    include: { ticketTypes: true, activeLote: true },
  });
  if (!event) throw new Error('Evento não encontrado');

  const tt = event.ticketTypes.find((t) => t.id === input.ticketTypeId);
  if (!tt) throw new Error('Tipo de ingresso inválido');

  const avail = tt.totalQty - tt.sold;
  if (qty > avail) {
    throw new Error(`Estoque insuficiente para ${tt.name} (disponível: ${avail})`);
  }

  const isCourtesy = input.kind === 'courtesy';
  const unit =
    isCourtesy
      ? 0
      : (input.unitPriceCents != null
          ? Math.max(0, Math.floor(input.unitPriceCents))
          : (event.activeLote?.precoCents ?? tt.priceCents));
  const totalCents = unit * qty;
  const accessCode = 'LN-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const activeLoteId = event.activeLote?.id || null;

  const ticketCreates = Array.from({ length: qty }).map(() => {
    const code = generateUniqueCode();
    return {
      ticketTypeId: tt.id,
      uniqueCode: code,
      qrPayload: signCode(code),
      status: 'valid',
    };
  });

  const order = await prisma.order.create({
    data: {
      eventId: event.id,
      buyerName: input.buyerName.trim(),
      buyerEmail: input.buyerEmail.trim().toLowerCase(),
      buyerCpf: input.buyerCpf?.replace(/\D/g, '') || null,
      buyerPhone: input.buyerPhone?.replace(/\D/g, '') || null,
      totalCents,
      status: 'paid',
      paymentGateway: 'manual',
      paymentMethod: isCourtesy ? 'courtesy' : 'manual',
      paymentId: isCourtesy ? `courtesy-${Date.now()}` : `manual-${Date.now()}`,
      accessCode,
      paidAt: new Date(),
      loteId: activeLoteId,
      grossCents: totalCents,
      netCents: totalCents,
      feeCents: 0,
      feeDetails: isCourtesy
        ? 'cortesia R$0'
        : `manual ${input.notes ? input.notes.slice(0, 80) : 'admin'}`,
      tickets: { create: ticketCreates },
    },
    include: {
      tickets: { include: { ticketType: true } },
      event: true,
    },
  });

  await prisma.ticketType.update({
    where: { id: tt.id },
    data: { sold: { increment: qty } },
  });

  if (activeLoteId) {
    await prisma.lote.update({
      where: { id: activeLoteId },
      data: { sold: { increment: qty } },
    });
  }

  try {
    const { performAutomaticVirada } = await import('@/lib/lote-virada');
    await performAutomaticVirada(event.id);
  } catch (e) {
    console.error('[ADMIN ORDER] virada automática falhou', e);
  }

  return order;
}

/**
 * Cancela pedidos pending mais antigos que `minutes` e devolve estoque.
 * minutes=0 → todos os pending (use com cuidado).
 */
export async function cleanupPendingOrders(options: {
  minutes: number;
  eventId?: string | null;
  /** Só "Checkout em andamento" / sem e-mail */
  onlyAbandoned?: boolean;
}): Promise<{
  cleaned: number;
  ticketsReleased: number;
  orderIds: string[];
  skippedPaid: number;
  scanned: number;
}> {
  const minutesRaw = Math.floor(options.minutes ?? 30);
  const minutes =
    minutesRaw <= 0
      ? 0
      : Math.max(1, Math.min(7 * 24 * 60, minutesRaw));
  const cutoff =
    minutes <= 0 ? new Date() : new Date(Date.now() - minutes * 60 * 1000);

  const pending = await prisma.order.findMany({
    where: {
      status: 'pending',
      ...(minutes > 0 ? { createdAt: { lt: cutoff } } : {}),
      ...(options.eventId ? { eventId: options.eventId } : {}),
    },
    select: {
      id: true,
      buyerName: true,
      buyerEmail: true,
      paymentId: true,
    },
  });

  let list = pending;
  if (options.onlyAbandoned) {
    list = pending.filter((o) => {
      const name = (o.buyerName || '').trim();
      const email = (o.buyerEmail || '').trim();
      return (
        !email ||
        name === 'Checkout em andamento' ||
        name === '' ||
        name === '—'
      );
    });
  }

  let ticketsReleased = 0;
  let skippedPaid = 0;
  const orderIds: string[] = [];

  for (const row of list) {
    // Antes de cancelar: se for cartão Stripe e o PI já succeeded, marca pago
    try {
      const pi = row.paymentId || '';
      if (pi.startsWith('pi_')) {
        const { reconcileStripeOrder } = await import('@/lib/stripe-reconcile');
        const r = await reconcileStripeOrder(row.id, { paymentIntentId: pi });
        if (r.status === 'paid' || r.finalized || r.alreadyPaid) {
          skippedPaid += 1;
          continue;
        }
      }
    } catch {
      /* segue cleanup */
    }

    const result = await releaseOrderStock(row.id);
    ticketsReleased += result.ticketsReleased;
    const label =
      minutes <= 0
        ? 'cancelado admin (limpeza pending)'
        : `expirado após ${minutes}min (cleanup)`;
    await prisma.order.update({
      where: { id: row.id },
      data: {
        status: 'cancelled',
        feeDetails: label.slice(0, 250),
      },
    });
    try {
      const { logOrderEvent } = await import('@/lib/order-log');
      await logOrderEvent(
        row.id,
        'cancelled',
        'Pedido cancelado (limpeza pending)',
        `${label} · ${result.ticketsReleased} ingresso(s) devolvido(s)`
      );
    } catch {
      /* ignore */
    }
    orderIds.push(row.id);
  }

  return {
    cleaned: orderIds.length,
    ticketsReleased,
    orderIds,
    skippedPaid,
    scanned: list.length,
  };
}

/**
 * Pedidos já cancelados que ainda têm tickets "valid" — devolve estoque.
 * (Corrige cancelamentos antigos que não liberaram sold.)
 */
export async function repairCancelledOrdersStock(): Promise<{
  fixed: number;
  ticketsReleased: number;
}> {
  const cancelled = await prisma.order.findMany({
    where: { status: { in: ['cancelled', 'canceled'] } },
    include: {
      tickets: { select: { id: true, status: true } },
    },
    take: 500,
    orderBy: { createdAt: 'desc' },
  });

  let fixed = 0;
  let ticketsReleased = 0;
  for (const o of cancelled) {
    const active = o.tickets.filter((t) => t.status !== 'cancelled');
    if (active.length === 0) continue;
    const r = await releaseOrderStock(o.id);
    if (r.ticketsReleased > 0) {
      fixed += 1;
      ticketsReleased += r.ticketsReleased;
    }
  }
  return { fixed, ticketsReleased };
}
