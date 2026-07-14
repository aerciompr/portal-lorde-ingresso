/**
 * Regras de listagem pública de eventos (home + /eventos).
 * Inclui o dia inteiro (evita sumir evento “hoje” por fuso/hora).
 */

/** Início do dia local (00:00) — eventos de hoje ainda entram na programação */
export function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Fim do dia local */
export function endOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Prisma where: eventos “em cartaz” na home / programação.
 * - data >= início de hoje
 * - hidden = false (exclusivos só por link direto)
 */
export function upcomingEventsWhere() {
  return {
    date: { gte: startOfLocalDay() },
    hidden: false,
  };
}

/** Eventos públicos (listagem) — inclui filtro de ocultos */
export function publicListEventsWhere(extra?: Record<string, unknown>) {
  return {
    hidden: false,
    ...extra,
  };
}
