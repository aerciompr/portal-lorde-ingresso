/**
 * Matching lote ↔ ticket type (sem Prisma — seguro no client).
 */

/** Extrai product id de nome "Lote 1 (#62902)" */
export function productIdFromLoteNome(nome: string): string | null {
  return nome.match(/#(\d+)/)?.[1] || null;
}

/** TicketType correspondente ao lote (tag woo:product) */
export function matchTicketTypeToLote<
  T extends {
    id: string;
    description?: string | null;
    priceCents: number;
    sold: number;
    totalQty: number;
  },
>(
  lote: { nome: string; precoCents: number },
  types: T[]
): T | null {
  if (!types.length) return null;
  const pid = productIdFromLoteNome(lote.nome);
  if (pid) {
    const byTag = types.find((t) =>
      (t.description || '').includes(`[woo:product:${pid}]`)
    );
    if (byTag) return byTag;
  }
  const withStock = types.filter((t) => t.sold < t.totalQty);
  const byPrice = withStock.find((t) => t.priceCents === lote.precoCents);
  if (byPrice) return byPrice;
  if (withStock.length) return withStock[0];
  return types.find((t) => t.priceCents === lote.precoCents) || types[0] || null;
}
