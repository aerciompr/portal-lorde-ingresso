import { describe, expect, it } from 'vitest';
import { calculatePromoDiscount, describePromoRules, normalizePromoCode } from './promo-validate';

const base = {
  code: 'PROMO10',
  active: true,
  eventId: null as string | null,
  discountType: 'PERCENT',
  discountValue: 10,
  minTickets: null as number | null,
  maxTicketsDiscounted: null as number | null,
  minSubtotalCents: null as number | null,
  maxUses: null as number | null,
  maxUsesPerEmail: null as number | null,
  reservedUses: 0,
  startsAt: null as Date | null,
  endsAt: null as Date | null,
};

describe('normalizePromoCode', () => {
  it('trim + upper', () => {
    expect(normalizePromoCode('  lorde10 ')).toBe('LORDE10');
  });
});

describe('calculatePromoDiscount', () => {
  it('aplica % no total', () => {
    const r = calculatePromoDiscount(base, {
      eventId: 'ev1',
      unitPricesCents: [10000, 10000],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountCents).toBe(2000);
      expect(r.totalCents).toBe(18000);
    }
  });

  it('PERCENT só nos primeiros N (mais caros)', () => {
    const r = calculatePromoDiscount(
      { ...base, discountValue: 50, maxTicketsDiscounted: 1 },
      { eventId: 'ev1', unitPricesCents: [10000, 5000] }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 50% do mais caro (10000)
      expect(r.discountCents).toBe(5000);
      expect(r.totalCents).toBe(10000);
      expect(r.ticketsDiscounted).toBe(1);
    }
  });

  it('FIXED_ORDER limita ao subtotal', () => {
    const r = calculatePromoDiscount(
      { ...base, discountType: 'FIXED_ORDER', discountValue: 50000 },
      { eventId: 'ev1', unitPricesCents: [3000] }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountCents).toBe(3000);
      expect(r.totalCents).toBe(0);
    }
  });

  it('FIXED_PER_TICKET com max tickets', () => {
    const r = calculatePromoDiscount(
      {
        ...base,
        discountType: 'FIXED_PER_TICKET',
        discountValue: 500,
        maxTicketsDiscounted: 2,
      },
      { eventId: 'ev1', unitPricesCents: [3000, 3000, 3000] }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountCents).toBe(1000);
      expect(r.totalCents).toBe(8000);
    }
  });

  it('rejeita evento errado', () => {
    const r = calculatePromoDiscount(
      { ...base, eventId: 'evA' },
      { eventId: 'evB', unitPricesCents: [1000] }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('wrong_event');
  });

  it('rejeita min tickets', () => {
    const r = calculatePromoDiscount(
      { ...base, minTickets: 2 },
      { eventId: 'ev1', unitPricesCents: [1000] }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('min_tickets');
  });

  it('rejeita esgotado', () => {
    const r = calculatePromoDiscount(
      { ...base, maxUses: 1, reservedUses: 1 },
      { eventId: 'ev1', unitPricesCents: [1000] }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('exhausted');
  });

  it('rejeita expirado', () => {
    const r = calculatePromoDiscount(
      { ...base, endsAt: new Date('2020-01-01') },
      { eventId: 'ev1', unitPricesCents: [1000], now: new Date('2026-01-01') }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('expired');
  });

  it('rejeita inativo', () => {
    const r = calculatePromoDiscount(
      { ...base, active: false },
      { eventId: 'ev1', unitPricesCents: [1000] }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('inactive');
  });
});

describe('describePromoRules', () => {
  it('monta texto legível', () => {
    const s = describePromoRules({
      discountType: 'PERCENT',
      discountValue: 10,
      maxTicketsDiscounted: 2,
      maxUses: 50,
      maxUsesPerEmail: 1,
      eventTitle: 'Iron Maiden',
    });
    expect(s).toContain('10%');
    expect(s).toContain('primeiros 2');
    expect(s).toContain('Iron Maiden');
    expect(s).toContain('50 usos');
    expect(s).toContain('1x por e-mail');
  });
});
