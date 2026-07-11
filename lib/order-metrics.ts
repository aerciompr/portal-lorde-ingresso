/**
 * Métricas de pedidos (regras de negócio do dashboard).
 * Bruto/líquido/ingressos = só status paid. Estornos à parte.
 */

export type MetricOrder = {
  status: string;
  totalCents: number;
  grossCents?: number;
  netCents?: number;
  tickets?: { id: string; status?: string }[];
  event?: { title: string };
};

export function summarizeOrders(orders: MetricOrder[]) {
  const paid = orders.filter((o) => (o.status || '').toLowerCase() === 'paid');
  const refunded = orders.filter((o) => (o.status || '').toLowerCase() === 'refunded');
  const pending = orders.filter((o) => (o.status || '').toLowerCase() === 'pending');

  const totalBruto = paid.reduce((s, o) => s + (o.grossCents || o.totalCents || 0), 0);
  const totalLiquido = paid.reduce((s, o) => s + (o.netCents || 0), 0);
  const totalEstornos = refunded.reduce(
    (s, o) => s + (o.grossCents || o.totalCents || 0),
    0
  );
  const paidTickets = paid.reduce((s, o) => {
    const n = o.tickets?.filter((t) => t.status !== 'cancelled').length;
    return s + (n && n > 0 ? n : 1);
  }, 0);

  return {
    paidCount: paid.length,
    refundedCount: refunded.length,
    pendingCount: pending.length,
    totalBruto,
    totalLiquido,
    totalEstornos,
    paidTickets,
  };
}

/** Estornos não entram no bruto (invariante) */
export function brutoNeverIncludesRefunds(orders: MetricOrder[]): boolean {
  const s = summarizeOrders(orders);
  const paidOnly = orders
    .filter((o) => (o.status || '').toLowerCase() === 'paid')
    .reduce((sum, o) => sum + (o.grossCents || o.totalCents || 0), 0);
  return s.totalBruto === paidOnly;
}
