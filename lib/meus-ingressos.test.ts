import { describe, expect, it } from 'vitest';
import { isActiveUpcoming, isRefunded, partitionOrders } from './meus-ingressos';

describe('meus-ingressos', () => {
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  const past = new Date(Date.now() - 7 * 86400000).toISOString();

  it('isRefunded', () => {
    expect(isRefunded({ status: 'refunded' })).toBe(true);
    expect(isRefunded({ status: 'paid' })).toBe(false);
  });

  it('isActiveUpcoming exclui estorno mesmo com data futura', () => {
    expect(
      isActiveUpcoming({ status: 'refunded', event: { date: future } })
    ).toBe(false);
    expect(isActiveUpcoming({ status: 'paid', event: { date: future } })).toBe(true);
  });

  it('partitionOrders não conta estorno em válidos/próximos', () => {
    const r = partitionOrders([
      { status: 'paid', event: { date: future }, tickets: [{}, {}] },
      { status: 'refunded', event: { date: future }, tickets: [{}] },
      { status: 'paid', event: { date: past }, tickets: [{}] },
    ]);
    expect(r.counts.ticketsProximos).toBe(2);
    expect(r.counts.ticketsPassados).toBe(1);
    expect(r.counts.ticketsEstornos).toBe(1);
    expect(r.counts.ticketsValidos).toBe(3);
  });
});
