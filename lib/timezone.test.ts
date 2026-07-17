import { describe, expect, it } from 'vitest';
import {
  formatDateTimeInAppTz,
  parseAppLocalDateTime,
  toAppDatetimeLocalValue,
  ymdInAppTz,
} from './timezone';

describe('timezone America/Maceio', () => {
  it('ymdInAppTz em instante UTC conhecido', () => {
    // 2026-07-16 02:30 UTC = 2026-07-15 23:30 Maceió
    const d = new Date('2026-07-16T02:30:00.000Z');
    expect(ymdInAppTz(d)).toBe('2026-07-15');
  });

  it('parseAppLocalDateTime 20:00 Maceió → UTC 23:00', () => {
    const d = parseAppLocalDateTime('2026-08-14T20:00');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-08-14T23:00:00.000Z');
  });

  it('toAppDatetimeLocalValue usa Maceió, não UTC', () => {
    // 22:30 UTC = 19:30 Maceió — NÃO pode virar 22:30 no datetime-local
    const d = new Date('2026-07-17T22:30:00.000Z');
    expect(toAppDatetimeLocalValue(d)).toBe('2026-07-17T19:30');
  });

  it('roundtrip datetime-local Maceió', () => {
    const local = '2026-07-17T19:30';
    const d = parseAppLocalDateTime(local);
    expect(d).not.toBeNull();
    expect(toAppDatetimeLocalValue(d)).toBe(local);
  });

  it('formatDateTimeInAppTz mostra fuso Maceió', () => {
    const d = new Date('2026-08-14T23:00:00.000Z'); // 20:00 em Maceió
    const s = formatDateTimeInAppTz(d);
    expect(s).toMatch(/14/);
    expect(s).toMatch(/08|ago|8/);
    expect(s).toMatch(/20/);
  });
});
