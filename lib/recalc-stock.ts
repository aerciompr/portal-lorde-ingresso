import { prisma } from '@/lib/prisma';

// Re-export utils puros (server routes podem importar daqui)
export { matchTicketTypeToLote, productIdFromLoteNome } from '@/lib/lote-match';

/**
 * Recalcula sold de TicketType e Lote a partir dos tickets válidos de pedidos pagos.
 * Corrige double-count pós-import (CSV lotes já trazia sold + pedidos incrementavam de novo).
 */
export async function recalcEventStock(eventId: string): Promise<{
  ticketTypes: number;
  lotes: number;
}> {
  const types = await prisma.ticketType.findMany({
    where: { eventId },
    select: { id: true, description: true, totalQty: true },
  });

  let ttUpdated = 0;
  const soldByType = new Map<string, number>();

  for (const tt of types) {
    const sold = await prisma.ticket.count({
      where: {
        ticketTypeId: tt.id,
        status: { not: 'cancelled' },
        order: { status: 'paid' },
      },
    });
    // Nunca deixa sold > totalQty no contador (estoque negativo confunde UI)
    const safeSold = Math.min(Math.max(0, sold), Math.max(tt.totalQty, sold));
    await prisma.ticketType.update({
      where: { id: tt.id },
      data: { sold: safeSold },
    });
    soldByType.set(tt.id, safeSold);
    ttUpdated += 1;
  }

  const lotes = await prisma.lote.findMany({
    where: { eventId },
    select: { id: true, nome: true, totalQty: true, ativo: true },
  });

  let loteUpdated = 0;
  for (const lote of lotes) {
    const productId = lote.nome.match(/#(\d+)/)?.[1];
    let sold = 0;
    if (productId) {
      const matched = types.find((t) =>
        (t.description || '').includes(`[woo:product:${productId}]`)
      );
      if (matched) {
        sold = soldByType.get(matched.id) ?? 0;
      }
    }
    // Sem match: conta tickets do pedido cujo loteId = este lote
    if (!productId || sold === 0) {
      const byOrderLote = await prisma.ticket.count({
        where: {
          status: { not: 'cancelled' },
          order: { status: 'paid', loteId: lote.id },
        },
      });
      if (byOrderLote > 0) sold = byOrderLote;
      else if (productId) {
        // mantém sold já calculado do type se houver
        const matched = types.find((t) =>
          (t.description || '').includes(`[woo:product:${productId}]`)
        );
        if (matched) sold = soldByType.get(matched.id) ?? 0;
      }
    }

    const safeSold = Math.min(Math.max(0, sold), Math.max(lote.totalQty, sold));
    const esgotado = safeSold >= lote.totalQty;
    await prisma.lote.update({
      where: { id: lote.id },
      data: {
        sold: safeSold,
        // não força ativo=false se admin marcou ativo com vaga
        ...(esgotado ? { ativo: false } : {}),
      },
    });
    loteUpdated += 1;
  }

  // Garante activeLote: preferir lote ativo com vaga; senão o de maior ordem com vaga
  const refreshed = await prisma.lote.findMany({
    where: { eventId },
    orderBy: { ordem: 'asc' },
  });
  const withStock = refreshed.filter((l) => l.sold < l.totalQty);
  const preferred =
    withStock.find((l) => l.ativo) ||
    withStock[withStock.length - 1] ||
    null;

  if (preferred) {
    // Só um ativo
    for (const l of refreshed) {
      const shouldActive = l.id === preferred.id;
      if (l.ativo !== shouldActive) {
        await prisma.lote.update({
          where: { id: l.id },
          data: { ativo: shouldActive },
        });
      }
    }
    await prisma.event.update({
      where: { id: eventId },
      data: { activeLoteId: preferred.id },
    });
  }

  return { ticketTypes: ttUpdated, lotes: loteUpdated };
}

export async function recalcAllEventsStock(eventIds?: string[]): Promise<{
  events: number;
}> {
  const ids =
    eventIds && eventIds.length
      ? eventIds
      : (
          await prisma.event.findMany({
            select: { id: true },
          })
        ).map((e) => e.id);

  for (const id of ids) {
    await recalcEventStock(id);
  }
  return { events: ids.length };
}
