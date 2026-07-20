import { NextRequest, NextResponse } from 'next/server';
import { activateNewLote } from '@/lib/lote-virada';
import { requireAdminMutation } from '@/lib/request-security';

/**
 * Virada manual: cria novo lote, lote anterior fica esgotado + inativo.
 * (virada automática: importar de @/lib/lote-virada — NÃO reexportar daqui)
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const { eventId, newNome, newPreco, newQty } = await req.json();

  if (!eventId || !newNome || newPreco == null || !newQty) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  const preco = Number(newPreco);
  const qty = Number(newQty);
  if (!Number.isFinite(preco) || preco < 0) {
    return NextResponse.json({ error: 'Preço inválido' }, { status: 400 });
  }
  if (!Number.isFinite(qty) || qty < 1) {
    return NextResponse.json({ error: 'Quantidade inválida (mín. 1)' }, { status: 400 });
  }

  try {
    const newLote = await activateNewLote({
      eventId,
      nome: String(newNome).trim(),
      precoCents: preco,
      totalQty: Math.floor(qty),
      viradaAutomatica: true,
      source: 'manual',
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
