import { prisma } from '@/lib/prisma';

/**
 * Desativa um lote e marca como esgotado (sold = totalQty).
 * Usado na virada manual e automática.
 */
export async function markLoteEsgotado(loteId: string) {
  const lote = await prisma.lote.findUnique({ where: { id: loteId } });
  if (!lote) return;
  await prisma.lote.update({
    where: { id: loteId },
    data: {
      ativo: false,
      // garante "esgotado" na UI/admin mesmo se ainda sobrava capacidade
      sold: Math.max(lote.sold, lote.totalQty),
    },
  });
}

async function logViradaAndNotify(params: {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventDate: Date;
  fromLoteId: string | null;
  fromLoteNome: string | null;
  toLoteId: string;
  toLoteNome: string;
  precoCents: number;
  source: 'auto' | 'manual';
}) {
  try {
    await prisma.loteViradaLog.create({
      data: {
        eventId: params.eventId,
        fromLoteId: params.fromLoteId,
        fromLoteNome: params.fromLoteNome,
        toLoteId: params.toLoteId,
        toLoteNome: params.toLoteNome,
        precoCents: params.precoCents,
        source: params.source,
      },
    });
  } catch (e) {
    console.error('[VIRADA] falha ao gravar LoteViradaLog (rode sql-lote-virada-log.sql?):', e);
  }

  try {
    const { getAlertEmailForLote } = await import('@/lib/lote-stock-alerts');
    const { sendLoteViradaAlert } = await import('@/lib/email');
    const to = await getAlertEmailForLote();
    if (to) {
      await sendLoteViradaAlert({
        to,
        eventTitle: params.eventTitle,
        eventSlug: params.eventSlug,
        eventDate: params.eventDate,
        fromLoteNome: params.fromLoteNome,
        toLoteNome: params.toLoteNome,
        precoCents: params.precoCents,
        source: params.source,
      });
    }
  } catch (e) {
    console.error('[VIRADA] falha ao enviar e-mail de virada:', e);
  }
}

/**
 * Cria o próximo lote e torna-o ativo.
 * O lote ativo anterior fica esgotado + inativo.
 */
export async function activateNewLote(options: {
  eventId: string;
  nome: string;
  precoCents: number;
  totalQty: number;
  viradaAutomatica?: boolean;
  source?: 'auto' | 'manual';
}) {
  const event = await prisma.event.findUnique({
    where: { id: options.eventId },
    include: { lotes: { orderBy: { ordem: 'desc' } } },
  });
  if (!event) throw new Error('Evento não encontrado');

  const maxOrdem = event.lotes[0]?.ordem || 0;
  const fromLoteId = event.activeLoteId || null;
  const fromLote = fromLoteId
    ? event.lotes.find((l) => l.id === fromLoteId) ||
      (await prisma.lote.findUnique({ where: { id: fromLoteId } }))
    : null;
  const fromLoteNome = fromLote?.nome || null;

  if (fromLoteId) {
    await markLoteEsgotado(fromLoteId);
  }

  // Qualquer outro lote ainda marcado ativo (inconsistência)
  await prisma.lote.updateMany({
    where: { eventId: options.eventId, ativo: true },
    data: { ativo: false },
  });

  const newLote = await prisma.lote.create({
    data: {
      eventId: options.eventId,
      nome: options.nome,
      precoCents: options.precoCents,
      totalQty: options.totalQty,
      ordem: maxOrdem + 1,
      viradaAutomatica: options.viradaAutomatica ?? true,
      ativo: true,
      sold: 0,
    },
  });

  await prisma.event.update({
    where: { id: options.eventId },
    data: { activeLoteId: newLote.id },
  });

  // Alinha TicketType (preço + capacidade) com o novo lote — senão o site fica "esgotado"
  try {
    const { syncTicketTypeCapacityForEvent } = await import('@/lib/lote-ticket-sync');
    await syncTicketTypeCapacityForEvent(options.eventId);
  } catch (e) {
    console.error('[VIRADA] sync ticket type falhou', e);
  }

  const source = options.source || 'manual';
  await logViradaAndNotify({
    eventId: options.eventId,
    eventTitle: event.title,
    eventSlug: event.slug,
    eventDate: event.date,
    fromLoteId,
    fromLoteNome,
    toLoteId: newLote.id,
    toLoteNome: newLote.nome,
    precoCents: newLote.precoCents,
    source,
  });

  return newLote;
}

/**
 * Virada automática: se o lote ativo esgotou (sold >= totalQty) e tem viradaAutomatica,
 * cria o próximo lote com acréscimo de preço e qtd padrão do evento.
 */
export async function performAutomaticVirada(eventId: string): Promise<{
  turned: boolean;
  newLoteId?: string;
  reason?: string;
}> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { lotes: { orderBy: { ordem: 'desc' } } },
  });
  if (!event) return { turned: false, reason: 'evento não encontrado' };
  if (!event.activeLoteId) return { turned: false, reason: 'sem lote ativo' };

  const currentLote = await prisma.lote.findUnique({ where: { id: event.activeLoteId } });
  if (!currentLote) return { turned: false, reason: 'lote ativo inválido' };

  if (!currentLote.viradaAutomatica) {
    return { turned: false, reason: 'virada automática desligada neste lote' };
  }

  if (currentLote.sold < currentLote.totalQty) {
    return { turned: false, reason: 'ainda há estoque no lote' };
  }

  const maxOrdem = event.lotes[0]?.ordem || currentLote.ordem;
  const nextPreco = currentLote.precoCents + (event.loteAcrescimoCents || 500);
  const nextNome = `Lote ${maxOrdem + 1}`;
  const nextQty = event.loteDefaultQty || 50;

  const newLote = await activateNewLote({
    eventId,
    nome: nextNome,
    precoCents: nextPreco,
    totalQty: nextQty,
    viradaAutomatica: true,
    source: 'auto',
  });

  console.log(
    `[AUTO VIRADA] Event ${eventId} -> ${newLote.nome} @ ${(nextPreco / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
  );

  return { turned: true, newLoteId: newLote.id };
}
