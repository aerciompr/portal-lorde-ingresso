/**
 * Preço "a partir de" exibido nos cards.
 * Prioridade: lote ativo → menor lote com vaga → menor ticketType.
 * (Venda real no checkout usa activeLote.precoCents.)
 */

export type EventPriceInput = {
  ticketTypes?: { priceCents: number; totalQty?: number; sold?: number }[];
  lotes?: {
    precoCents: number;
    totalQty: number;
    sold: number;
    ativo?: boolean;
  }[];
  activeLote?: { precoCents: number } | null;
};

export function eventMinPriceCents(event: EventPriceInput): number {
  if (event.activeLote && Number.isFinite(event.activeLote.precoCents)) {
    return Math.max(0, event.activeLote.precoCents);
  }

  const lotes = event.lotes || [];
  if (lotes.length > 0) {
    const withStock = lotes.filter((l) => (l.sold || 0) < (l.totalQty || 0));
    const pool = withStock.length > 0 ? withStock : lotes;
    const prices = pool.map((l) => l.precoCents).filter((p) => Number.isFinite(p));
    if (prices.length) return Math.max(0, Math.min(...prices));
  }

  const tts = event.ticketTypes || [];
  if (tts.length > 0) {
    const prices = tts.map((t) => t.priceCents).filter((p) => Number.isFinite(p));
    if (prices.length) return Math.max(0, Math.min(...prices));
  }

  return 0;
}

/** Tem vaga? Lotes com estoque ou ticketTypes */
export function eventHasAvailability(event: EventPriceInput): boolean {
  const lotes = event.lotes || [];
  if (lotes.length > 0) {
    return lotes.some((l) => (l.sold || 0) < (l.totalQty || 0));
  }
  const tts = event.ticketTypes || [];
  if (tts.length > 0) {
    return tts.some((t) => (t.sold || 0) < (t.totalQty ?? Infinity));
  }
  return false;
}
