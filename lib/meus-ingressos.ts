/** Helpers puros da área Meus Ingressos (extraídos para testabilidade). */

export function eventDate(d: string | Date) {
  return new Date(d);
}

export function isUpcoming(d: string | Date) {
  const limit = new Date(d);
  limit.setHours(23, 59, 59, 999);
  return limit.getTime() >= Date.now();
}

export function isRefunded(o: { status: string }) {
  return (o.status || '').toLowerCase() === 'refunded';
}

export function isActiveUpcoming(o: {
  status: string;
  event: { date: string | Date };
}) {
  const s = (o.status || '').toLowerCase();
  if (s === 'refunded' || s === 'cancelled' || s === 'canceled') return false;
  return isUpcoming(o.event.date);
}

export function relativeEventLabel(d: string | Date, refunded = false): string {
  if (refunded) return 'Estornado';
  const event = eventDate(d);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startEvent = new Date(event);
  startEvent.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startEvent.getTime() - startToday.getTime()) / 86400000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Amanhã';
  if (diffDays > 1 && diffDays <= 60) return `Em ${diffDays} dias`;
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    if (n === 1) return 'Ontem';
    if (n <= 60) return `Há ${n} dias`;
    return 'Encerrado';
  }
  return 'Por vir';
}

export function formatDateShort(d: string | Date) {
  return eventDate(d).toLocaleDateString('pt-BR', {
    timeZone: 'America/Maceio',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type BucketOrder = {
  status: string;
  event: { date: string | Date };
  tickets?: unknown[];
};

export function partitionOrders<T extends BucketOrder>(orders: T[]) {
  const up: T[] = [];
  const pa: T[] = [];
  const ref: T[] = [];
  for (const o of orders) {
    if (isRefunded(o)) {
      ref.push(o);
      continue;
    }
    if (isActiveUpcoming(o)) up.push(o);
    else pa.push(o);
  }
  up.sort(
    (a, b) => eventDate(a.event.date).getTime() - eventDate(b.event.date).getTime()
  );
  pa.sort(
    (a, b) => eventDate(b.event.date).getTime() - eventDate(a.event.date).getTime()
  );
  ref.sort(
    (a, b) => eventDate(b.event.date).getTime() - eventDate(a.event.date).getTime()
  );
  const ticketCount = (list: T[]) =>
    list.reduce((s, o) => s + (o.tickets?.length || 0), 0);
  return {
    upcoming: up,
    past: pa,
    refunded: ref,
    counts: {
      ticketsValidos: ticketCount(up) + ticketCount(pa),
      ticketsProximos: ticketCount(up),
      ticketsPassados: ticketCount(pa),
      ticketsEstornos: ticketCount(ref),
    },
  };
}
