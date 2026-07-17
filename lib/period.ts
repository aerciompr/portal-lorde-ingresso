/** Helpers de período (dashboard admin + relatórios) — fuso America/Maceio */

import {
  ymdInAppTz,
  startOfAppDay,
  endOfAppDay,
  parseAppLocalDateTime,
} from './timezone';

export type PeriodId = 'today' | '7d' | '15d' | '30d' | 'all' | 'custom';

export function ymd(d: Date): string {
  return ymdInAppTz(d);
}

export function startOfLocalDay(d = new Date()): Date {
  return startOfAppDay(d);
}

export function endOfLocalDay(d = new Date()): Date {
  return endOfAppDay(d);
}

/** Parse YYYY-MM-DD como dia em Maceió */
export function parseYmdInApp(ymdStr: string): Date | null {
  return parseAppLocalDateTime(`${ymdStr}T00:00:00`);
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
  const to = ymd(now);
  const [yy, mm, dd] = to.split('-').map(Number);
  // aritmética de calendário em UTC (só data, sem hora) — fuso Maceió via ymd()
  const fromUtc = new Date(Date.UTC(yy, mm - 1, dd - (days - 1)));
  const from = fromUtc.toISOString().slice(0, 10);
  return { from, to };
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
