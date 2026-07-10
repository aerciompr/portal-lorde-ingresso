import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

/**
 * Remove lote (ou tipo de ingresso) com regras de segurança.
 * Body: { id, type: 'lote' | 'ticketType' }
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body.id as string | undefined;
  const type = (body.type === 'ticketType' ? 'ticketType' : 'lote') as 'lote' | 'ticketType';

  if (!id) {
    return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
  }

  try {
    if (type === 'lote') {
      const lote = await prisma.lote.findUnique({
        where: { id },
        include: {
          _count: { select: { orders: true } },
          activeForEvent: { select: { id: true } },
        },
      });

      if (!lote) {
        return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });
      }

      if (lote._count.orders > 0) {
        return NextResponse.json(
          {
            error: `Não é possível excluir: existem ${lote._count.orders} pedido(s) vinculados a este lote. Mantenha o histórico ou marque como esgotado.`,
          },
          { status: 400 }
        );
      }

      if (lote.sold > 0) {
        return NextResponse.json(
          {
            error: `Não é possível excluir: já há ${lote.sold} venda(s)/reserva(s) neste lote. Use virada ou deixe como esgotado.`,
          },
          { status: 400 }
        );
      }

      // Se era o lote ativo do evento, limpa o ponteiro
      if (lote.activeForEvent?.id) {
        await prisma.event.update({
          where: { id: lote.activeForEvent.id },
          data: { activeLoteId: null },
        });
      } else {
        const event = await prisma.event.findFirst({
          where: { activeLoteId: id },
          select: { id: true },
        });
        if (event) {
          await prisma.event.update({
            where: { id: event.id },
            data: { activeLoteId: null },
          });
        }
      }

      await prisma.lote.delete({ where: { id } });

      // Se o evento ficou sem lote ativo, tenta apontar para o último lote restante
      const remaining = await prisma.lote.findFirst({
        where: { eventId: lote.eventId },
        orderBy: { ordem: 'desc' },
      });
      if (remaining) {
        await prisma.lote.update({ where: { id: remaining.id }, data: { ativo: true } });
        await prisma.event.update({
          where: { id: lote.eventId },
          data: { activeLoteId: remaining.id },
        });
      }

      return NextResponse.json({ success: true, message: 'Lote removido' });
    }

    // ticketType
    const tt = await prisma.ticketType.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true } } },
    });

    if (!tt) {
      return NextResponse.json({ error: 'Tipo de ingresso não encontrado' }, { status: 404 });
    }

    if (tt._count.tickets > 0 || tt.sold > 0) {
      return NextResponse.json(
        {
          error: `Não é possível excluir: já existem ingressos emitidos (${tt._count.tickets}) ou vendas registradas (${tt.sold}).`,
        },
        { status: 400 }
      );
    }

    const remainingTypes = await prisma.ticketType.count({
      where: { eventId: tt.eventId },
    });
    if (remainingTypes <= 1) {
      return NextResponse.json(
        { error: 'Mantenha ao menos um tipo de ingresso no evento.' },
        { status: 400 }
      );
    }

    await prisma.ticketType.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Tipo de ingresso removido' });
  } catch (e: unknown) {
    console.error('[DELETE lote/ticket]', e);
    const msg = e instanceof Error ? e.message : 'Erro ao remover';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
