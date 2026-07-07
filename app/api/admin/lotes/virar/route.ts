import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { eventId, newNome, newPreco, newQty } = await req.json();

  if (!eventId || !newNome || !newPreco || !newQty) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ 
    where: { id: eventId }, 
    include: { lotes: { orderBy: { ordem: 'desc' } } } 
  });
  if (!event) return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });

  const maxOrdem = event.lotes[0]?.ordem || 0;

  // deactivate current active
  if (event.activeLoteId) {
    await prisma.lote.update({
      where: { id: event.activeLoteId },
      data: { ativo: false },
    });
  }

  const newLote = await prisma.lote.create({
    data: {
      eventId,
      nome: newNome,
      precoCents: newPreco,
      totalQty: newQty,
      ordem: maxOrdem + 1,
      viradaAutomatica: true,
      ativo: true,
    },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { activeLoteId: newLote.id },
  });

  return NextResponse.json({ success: true, lote: newLote });
}

// Função reutilizável para virada automática (chamada após pagamento confirmado)
// Segue exatamente a lógica do manual, mas calcula nome/preço/qtd automaticamente
export async function performAutomaticVirada(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { lotes: { orderBy: { ordem: 'desc' } } },
  });
  if (!event || !event.activeLoteId) return;

  const currentLote = await prisma.lote.findUnique({ where: { id: event.activeLoteId } });
  if (!currentLote || !currentLote.viradaAutomatica || currentLote.sold < currentLote.totalQty) {
    return;
  }

  // deactivate current active
  await prisma.lote.update({
    where: { id: currentLote.id },
    data: { ativo: false },
  });

  const maxOrdem = event.lotes[0]?.ordem || 0;

  const nextPreco = currentLote.precoCents + (event.loteAcrescimoCents || 500);
  const nextNome = `Lote ${maxOrdem + 1}`;
  const nextQty = event.loteDefaultQty || 50;

  const newLote = await prisma.lote.create({
    data: {
      eventId,
      nome: nextNome,
      precoCents: nextPreco,
      totalQty: nextQty,
      ordem: maxOrdem + 1,
      viradaAutomatica: true,
      ativo: true,
    },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { activeLoteId: newLote.id },
  });

  console.log(`[AUTO VIRADA] Event ${eventId} -> ${newLote.nome} @ R$${(nextPreco / 100).toFixed(2)}`);
}
