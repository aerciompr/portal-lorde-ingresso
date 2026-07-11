import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminMutation } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const body = await req.json();
  const { id, precoCents, totalQty, viradaAutomatica, ativo } = body;
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
  } = {};

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
  return NextResponse.json(lote);
}
