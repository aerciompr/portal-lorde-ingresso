import { describe, expect, it } from 'vitest';
import { formatTimeAgo } from './utils';

const now = new Date('2026-07-15T15:00:00.000Z');

describe('formatTimeAgo', () => {
  it('agora / minutos / horas', () => {
    expect(formatTimeAgo(new Date(now.getTime() - 10_000), now)).toBe('agora');
    expect(formatTimeAgo(new Date(now.getTime() - 5 * 60_000), now)).toBe('há 5 min');
    expect(formatTimeAgo(new Date(now.getTime() - 1 * 60_000), now)).toBe('há 1 min');
    expect(formatTimeAgo(new Date(now.getTime() - 3 * 3600_000), now)).toBe('há 3 h');
    expect(formatTimeAgo(new Date(now.getTime() - 1 * 3600_000), now)).toBe('há 1 h');
  });

  it('dias após 24h', () => {
    expect(formatTimeAgo(new Date(now.getTime() - 25 * 3600_000), now)).toBe('há 1 dia');
    expect(formatTimeAgo(new Date(now.getTime() - 5 * 24 * 3600_000), now)).toBe('há 5 dias');
  });

  it('meses e anos', () => {
    expect(formatTimeAgo(new Date(now.getTime() - 45 * 24 * 3600_000), now)).toBe(
      'há 1 mês'
    );
    expect(formatTimeAgo(new Date(now.getTime() - 100 * 24 * 3600_000), now)).toBe(
      'há 3 meses'
    );
    expect(formatTimeAgo(new Date(now.getTime() - 400 * 24 * 3600_000), now)).toBe(
      'há 1 ano'
    );
  });

  it('vazio / inválido', () => {
    expect(formatTimeAgo(null, now)).toBe('—');
    expect(formatTimeAgo('invalid', now)).toBe('—');
  });
});
