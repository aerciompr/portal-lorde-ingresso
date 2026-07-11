/** Helpers de período (dashboard admin + relatórios) */

export type PeriodId = 'today' | '7d' | '15d' | '30d' | 'all' | 'custom';

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Converte período UI em from/to YYYY-MM-DD (API) */
export function periodToRange(
  period: PeriodId,
  customFrom = '',
  customTo = '',
  now = new Date()
): { from?: string; to?: string } {
  if (period === 'all') return {};
  if (period === 'today') {
    const t = ymd(now);
    return { from: t, to: t };
  }
  if (period === 'custom') {
    return {
      ...(customFrom ? { from: customFrom } : {}),
      ...(customTo ? { to: customTo } : {}),
    };
  }
  const days = period === '7d' ? 7 : period === '15d' ? 15 : 30;
  const from = startOfLocalDay(new Date(now));
  from.setDate(from.getDate() - (days - 1));
  return { from: ymd(from), to: ymd(now) };
}

export function isInPeriod(
  when: Date,
  range: { from?: Date | null; to?: Date | null }
): boolean {
  const t = when.getTime();
  if (range.from && t < range.from.getTime()) return false;
  if (range.to && t > range.to.getTime()) return false;
  return true;
}
