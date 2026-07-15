import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminMutation } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const body = await req.json();
  const { id, precoCents, totalQty, viradaAutomatica, ativo, nome } = body;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  }

  const existing = await prisma.lote.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });
  }

  const data: {
    precoCents?: number;
    totalQty?: number;
    viradaAutomatica?: boolean;
    ativo?: boolean;
    nome?: string;
  } = {};

  if (nome !== undefined) {
    const n = String(nome || '').trim();
    if (n.length < 1) {
      return NextResponse.json({ error: 'Nome do lote inválido' }, { status: 400 });
    }
    if (n.length > 255) {
      return NextResponse.json({ error: 'Nome do lote muito longo' }, { status: 400 });
    }
    data.nome = n;
  }

  if (precoCents !== undefined) {
    const p = parseInt(String(precoCents), 10);
    if (!Number.isFinite(p) || p < 0) {
      return NextResponse.json({ error: 'Preço inválido (centavos ≥ 0)' }, { status: 400 });
    }
    data.precoCents = p;
  }

  if (totalQty !== undefined) {
    const q = parseInt(String(totalQty), 10);
    if (!Number.isFinite(q) || q < 1) {
      return NextResponse.json({ error: 'Quantidade total inválida (mín. 1)' }, { status: 400 });
    }
    if (q < existing.sold) {
      return NextResponse.json(
        {
          error: `totalQty (${q}) não pode ser menor que já vendido (${existing.sold})`,
        },
        { status: 400 }
      );
    }
    data.totalQty = q;
  }

  if (viradaAutomatica !== undefined) data.viradaAutomatica = !!viradaAutomatica;
  if (ativo !== undefined) data.ativo = !!ativo;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
  }

  const lote = await prisma.lote.update({ where: { id }, data });

  // Preço/qtd/ativo: alinha TicketType com lote ativo (evita site “esgotado” com vaga no lote)
  try {
    const { syncTicketTypeCapacityForEvent } = await import('@/lib/lote-ticket-sync');
    await syncTicketTypeCapacityForEvent(lote.eventId);
  } catch (e) {
    console.error('[lote update] sync ticket type', e);
    // Fallback só de preço
    if (data.precoCents !== undefined) {
      const event = await prisma.event.findUnique({
        where: { id: lote.eventId },
        select: { activeLoteId: true },
      });
      if (event?.activeLoteId === lote.id || data.ativo === true) {
        await prisma.ticketType.updateMany({
          where: { eventId: lote.eventId },
          data: { priceCents: lote.precoCents },
        });
      }
    }
  }

  return NextResponse.json(lote);
}
