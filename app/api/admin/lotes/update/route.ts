import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, precoCents, totalQty, viradaAutomatica, ativo } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const lote = await prisma.lote.update({
    where: { id },
    data: {
      ...(precoCents !== undefined && { precoCents: parseInt(precoCents) }),
      ...(totalQty !== undefined && { totalQty: parseInt(totalQty) }),
      ...(viradaAutomatica !== undefined && { viradaAutomatica: !!viradaAutomatica }),
      ...(ativo !== undefined && { ativo: !!ativo }),
    },
  });
  return NextResponse.json(lote);
}
