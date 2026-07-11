import { describe, expect, it } from 'vitest';
import { brutoNeverIncludesRefunds, summarizeOrders } from './order-metrics';

describe('order-metrics', () => {
  const sample = [
    {
      status: 'paid',
      totalCents: 20,
      grossCents: 20,
      netCents: 18,
      tickets: [{ id: 't1', status: 'valid' }],
    },
    {
      status: 'refunded',
      totalCents: 20,
      grossCents: 20,
      netCents: 0,
      tickets: [{ id: 't2', status: 'cancelled' }],
    },
    {
      status: 'pending',
      totalCents: 20,
      grossCents: 0,
      netCents: 0,
      tickets: [{ id: 't3' }],
    },
  ];

  it('bruto e líquido só contam pagos', () => {
    const s = summarizeOrders(sample);
    expect(s.totalBruto).toBe(20);
    expect(s.totalLiquido).toBe(18);
    expect(s.totalEstornos).toBe(20);
    expect(s.paidCount).toBe(1);
    expect(s.paidTickets).toBe(1);
    expect(s.pendingCount).toBe(1);
  });

  it('invariante: bruto nunca inclui estorno', () => {
    expect(brutoNeverIncludesRefunds(sample)).toBe(true);
  });
});
