import { describe, expect, it } from 'vitest';
import { periodToRange, ymd } from './period';

describe('period', () => {
  // 15:00 em Maceió = 18:00 UTC (UTC-3)
  const fixed = new Date('2026-07-11T18:00:00.000Z');

  it('today retorna from=to do dia em Maceió', () => {
    const r = periodToRange('today', '', '', fixed);
    expect(r.from).toBe('2026-07-11');
    expect(r.to).toBe('2026-07-11');
  });

  it('7d cobre 7 dias inclusive (fuso Maceió)', () => {
    const r = periodToRange('7d', '', '', fixed);
    expect(r.to).toBe('2026-07-11');
    expect(r.from).toBe('2026-07-05');
  });

  it('all vazio', () => {
    expect(periodToRange('all', '', '', fixed)).toEqual({});
  });

  it('custom usa datas informadas', () => {
    expect(periodToRange('custom', '2026-01-01', '2026-01-31', fixed)).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('ymd formata no fuso America/Maceio', () => {
    // 03:00 UTC em 11/jul = 00:00 Maceió no mesmo dia
    expect(ymd(new Date('2026-07-11T03:00:00.000Z'))).toBe('2026-07-11');
    // 02:30 UTC em 11/jul = 23:30 Maceió no dia 10
    expect(ymd(new Date('2026-07-11T02:30:00.000Z'))).toBe('2026-07-10');
  });
});
