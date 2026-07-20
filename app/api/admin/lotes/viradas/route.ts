import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — últimas viradas de lote (feed do dashboard).
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '15', 10) || 15));

    const items = await prisma.loteViradaLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, title: true, slug: true, date: true } },
      },
    });

    return NextResponse.json({
      items: items.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        eventTitle: r.event?.title || 'Evento',
        eventSlug: r.event?.slug || '',
        eventDate: r.event?.date?.toISOString?.() || null,
        fromLoteId: r.fromLoteId,
        fromLoteNome: r.fromLoteNome,
        toLoteId: r.toLoteId,
        toLoteNome: r.toLoteNome,
        precoCents: r.precoCents,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error('[admin/lotes/viradas]', e);
    // Tabela ainda não criada no MySQL
    return NextResponse.json({
      items: [],
      error:
        (e as Error).message?.includes('LoteViradaLog') ||
        (e as Error).message?.includes('does not exist')
          ? 'Tabela LoteViradaLog ausente — rode scripts/sql-lote-virada-log.sql'
          : undefined,
    });
  }
}
