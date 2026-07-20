import { prisma } from '@/lib/prisma';
import { matchTicketTypeToLote } from '@/lib/lote-match';

/**
 * Com lotes, o estoque de venda é o LOTE. O TicketType ainda guarda sold
 * (para tickets/PDF). Após virada ou edição de qtd, o totalQty do tipo
 * precisa cobrir: já vendido no tipo + restante do lote ativo.
 *
 * Chamar APENAS em:
 * - virada de lote (activateNewLote)
 * - admin edita lote / capacidade
 *
 * NÃO chamar em:
 * - GET página pública do evento
 * - POST /api/orders/create
 * (gera Lock wait timeout 1205 sob concorrência)
 */
export async function syncTicketTypeCapacityForEvent(eventId: string): Promise<{
  ok: boolean;
  ticketTypeId?: string;
  totalQty?: number;
  reason?: string;
}> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      activeLote: true,
      ticketTypes: true,
    },
  });
  if (!event) return { ok: false, reason: 'evento não encontrado' };
  if (!event.ticketTypes.length) return { ok: false, reason: 'sem ticket types' };

  const lote = event.activeLote;
  if (!lote || !lote.ativo) {
    // Sem lote ativo: não mexe (evita reabrir tipos antigos)
    return { ok: true, reason: 'sem lote ativo' };
  }

  const remaining = Math.max(0, lote.totalQty - lote.sold);
  // Preferir tipo com mesmo preço / tag; se todos esgotados, ainda pega o primeiro
  const matched =
    matchTicketTypeToLote(lote, event.ticketTypes) || event.ticketTypes[0];

  const minTotal = matched.sold + remaining;
  // Pode reduzir capacity “fantasma” se o admin baixou o lote
  const nextTotal = Math.max(matched.sold, minTotal);

  await prisma.ticketType.update({
    where: { id: matched.id },
    data: {
      totalQty: nextTotal,
      priceCents: lote.precoCents,
    },
  });

  return {
    ok: true,
    ticketTypeId: matched.id,
    totalQty: nextTotal,
  };
}

/**
 * Garante capacidade no create do pedido (self-heal se sync falhou antes).
 */
export async function ensureTicketTypeCoversLote(params: {
  ticketTypeId: string;
  loteRemaining: number;
}): Promise<void> {
  const tt = await prisma.ticketType.findUnique({
    where: { id: params.ticketTypeId },
  });
  if (!tt) return;
  const need = tt.sold + Math.max(0, params.loteRemaining);
  if (tt.totalQty < need) {
    await prisma.ticketType.update({
      where: { id: tt.id },
      data: { totalQty: need },
    });
  }
}
