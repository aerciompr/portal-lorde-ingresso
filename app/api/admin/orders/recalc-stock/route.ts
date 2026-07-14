import { NextRequest, NextResponse } from 'next/server';
import { requireAdminMutation } from '@/lib/request-security';
import { recalcAllEventsStock, recalcEventStock } from '@/lib/recalc-stock';

/**
 * POST { eventId?: string }
 * Recalcula sold de lotes/tipos a partir de tickets pagos.
 * Corrige migração Woo que somou sold do CSV + pedidos.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  let body: { eventId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.eventId) {
    const r = await recalcEventStock(String(body.eventId));
    return NextResponse.json({
      success: true,
      eventId: body.eventId,
      ...r,
      message: 'Estoque recalculado para o evento',
    });
  }

  const r = await recalcAllEventsStock();
  return NextResponse.json({
    success: true,
    ...r,
    message: `Estoque recalculado em ${r.events} evento(s)`,
  });
}
