import { describe, expect, it } from 'vitest';
import { periodToRange, ymd } from './period';

describe('period', () => {
  const fixed = new Date('2026-07-11T15:00:00');

  it('today retorna from=to do dia', () => {
    const r = periodToRange('today', '', '', fixed);
    expect(r.from).toBe('2026-07-11');
    expect(r.to).toBe('2026-07-11');
  });

  it('7d cobre 7 dias inclusive', () => {
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

  it('ymd formata local', () => {
    expect(ymd(new Date(2026, 6, 11))).toBe('2026-07-11');
  });
});
