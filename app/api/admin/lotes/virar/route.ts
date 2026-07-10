import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { activateNewLote } from '@/lib/lote-virada';

/**
 * Virada manual: cria novo lote, lote anterior fica esgotado + inativo.
 * (virada automática: importar de @/lib/lote-virada — NÃO reexportar daqui)
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { eventId, newNome, newPreco, newQty } = await req.json();

  if (!eventId || !newNome || newPreco == null || !newQty) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  try {
    const newLote = await activateNewLote({
      eventId,
      nome: newNome,
      precoCents: Number(newPreco),
      totalQty: Number(newQty),
      viradaAutomatica: true,
    });

    return NextResponse.json({
      success: true,
      lote: newLote,
      message: 'Lote virado. O lote anterior foi marcado como esgotado.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro na virada';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
