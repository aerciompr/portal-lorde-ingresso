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
 * Prisma where: eventos “em cartaz” = data do evento >= início de hoje.
 * (Não usa `new Date()` na hora, senão um show às 20h some às 21h no mesmo dia
 * se a data no banco for meia-noite ou o fuso atrapalhar.)
 */
export function upcomingEventsWhere() {
  return {
    date: { gte: startOfLocalDay() },
  };
}
