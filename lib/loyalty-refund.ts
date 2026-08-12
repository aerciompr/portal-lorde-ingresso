/**
 * Estorno proporcional ao tempo restante do período pago da assinatura do clube
 * (não à quantidade de entradas resgatadas). Ex: pagou anual, cancelou no mês 3
 * de 12 → estorna 9/12 do que foi realmente cobrado na última fatura.
 */
export function calcLoyaltyRefundCents(membership: {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  lastInvoiceAmountCents: number | null;
}): number {
  const paid = membership.lastInvoiceAmountCents ?? 0;
  if (!paid || !membership.currentPeriodStart || !membership.currentPeriodEnd) return 0;

  const start = membership.currentPeriodStart.getTime();
  const end = membership.currentPeriodEnd.getTime();
  const totalMs = Math.max(1, end - start);
  const remainingMs = Math.max(0, Math.min(totalMs, end - Date.now()));

  return Math.round(paid * (remainingMs / totalMs));
}
