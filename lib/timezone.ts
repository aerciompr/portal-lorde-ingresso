/**
 * Fuso oficial do portal (Maceió/AL).
 * Servidor Docker costuma rodar em UTC — sempre formatar com timeZone.
 */
export const APP_TIMEZONE = 'America/Maceio';
export const APP_LOCALE = 'pt-BR';

export function formatDateInAppTz(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
): string {
  if (date == null || date === '') return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(APP_LOCALE, { ...options, timeZone: APP_TIMEZONE });
}

export function formatTimeInAppTz(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  if (date == null || date === '') return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(APP_LOCALE, { ...options, timeZone: APP_TIMEZONE });
}

export function formatDateTimeInAppTz(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  if (date == null || date === '') return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(APP_LOCALE, { ...options, timeZone: APP_TIMEZONE });
}

/** YYYY-MM-DD no fuso de Maceió (filtros “hoje”, relatórios) */
export function ymdInAppTz(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // en-CA dá YYYY-MM-DD
  return d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

/**
 * Interpreta "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm" como horário de Maceió
 * e devolve Date (UTC instant correto).
 */
export function parseAppLocalDateTime(raw: string): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  // datetime-local: 2026-08-14T20:00
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const hh = Number(m[4] ?? '0');
  const mm = Number(m[5] ?? '0');
  const ss = Number(m[6] ?? '0');

  // Maceió = UTC-3 o ano todo (sem horário de verão)
  const utcMs = Date.UTC(y, mo - 1, day, hh + 3, mm, ss);
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Início do dia em Maceió (00:00) → Date UTC */
export function startOfAppDay(date: Date | string = new Date()): Date {
  const ymd = ymdInAppTz(date);
  return parseAppLocalDateTime(`${ymd}T00:00:00`) || new Date(date);
}

/** Fim do dia em Maceió (23:59:59.999) → Date UTC */
export function endOfAppDay(date: Date | string = new Date()): Date {
  const ymd = ymdInAppTz(date);
  const d = parseAppLocalDateTime(`${ymd}T23:59:59`);
  if (!d) return new Date(date);
  d.setUTCMilliseconds(999);
  return d;
}
