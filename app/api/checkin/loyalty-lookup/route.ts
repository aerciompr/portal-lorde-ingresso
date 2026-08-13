import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPayload } from '@/lib/validate-ticket';
import { assertCheckinStaff } from '@/lib/checkin-staff';
import { getAdminUser } from '@/lib/auth';
import { logLoyaltyAudit } from '@/lib/loyalty-audit';

/**
 * Reconhecimento de sócio no check-in — SOMENTE LEITURA.
 * Não consome cota (`entriesUsedInPeriod`), não cria Order/Ticket. Serve pra staff
 * confirmar rapidamente "esse cliente é sócio ativo" e liberar fila prioritária.
 * O resgate de entrada grátis (que consome cota) é uma fase futura, ainda não implementada.
 */
export async function POST(req: NextRequest) {
  const gate = assertCheckinStaff(req);
  if (gate !== true) return gate;

  let code = '';
  let eventId = '';
  let eventTitle = '';
  try {
    const body = await req.json();
    code = String(body.code || '').trim();
    eventId = String(body.eventId || '').trim();
    eventTitle = String(body.eventTitle || '').trim();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 });
  }

  const cardCode = (verifyPayload(code) || code).toUpperCase();

  const membership = await prisma.loyaltyMembership.findFirst({
    where: { cardCode },
    include: { plan: true },
  });

  if (!membership) {
    return NextResponse.json({ error: 'Cartão de sócio não encontrado' }, { status: 404 });
  }

  const memberNumber =
    (await prisma.loyaltyMembership.count({
      where: { createdAt: { lte: membership.createdAt } },
    })) || undefined;

  const actor = (await getAdminUser()) || 'checkin-api';
  void logLoyaltyAudit({
    action: 'checkin_recognized',
    actor,
    entityType: 'LoyaltyMembership',
    entityId: membership.id,
    detail: eventTitle
      ? `Reconhecido no check-in do evento ${eventTitle}`
      : 'Reconhecido no check-in',
    meta: eventId ? { eventId, eventTitle } : null,
  });

  return NextResponse.json({
    found: true,
    buyerName: membership.buyerName,
    planName: membership.plan.name,
    status: membership.status,
    entriesUsedInPeriod: membership.entriesUsedInPeriod,
    freeEntriesPerCycle: membership.plan.freeEntriesPerCycle,
    memberNumber,
  });
}
