import { NextRequest, NextResponse } from 'next/server';
import { cleanupPendingOrders } from '@/lib/order-stock';
import { getAppSettings } from '@/lib/settings';

/**
 * Cron: limpa pedidos pending abandonados e devolve estoque.
 *
 * Auth:
 * - Header Authorization: Bearer <CRON_SECRET>
 * - ou query ?secret=<CRON_SECRET>
 * - ou x-cron-secret: <CRON_SECRET>
 *
 * Agendamento:
 * - Vercel: vercel.json (a cada 15 min)
 * - Externo: curl / Task Scheduler / cron-job.org apontando para esta URL
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_CRON_SECRET || '';
  // Em dev sem secret, permite (facilita testes locais)
  if (!secret && process.env.NODE_ENV !== 'production') return true;
  if (!secret) return false;

  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get('x-cron-secret') === secret) return true;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  // Vercel Cron envia Authorization: Bearer <CRON_SECRET> se configurado
  return false;
}

async function runCleanup(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getAppSettings();
  const minutesParam = req.nextUrl.searchParams.get('minutes');
  const minutes = minutesParam
    ? Math.max(5, parseInt(minutesParam, 10) || settings.pendingOrderTtlMinutes)
    : settings.pendingOrderTtlMinutes;

  const result = await cleanupPendingOrders({ minutes });

  console.log(
    `[CRON cleanup] minutes=${minutes} cleaned=${result.cleaned} ticketsReleased=${result.ticketsReleased}`
  );

  return NextResponse.json({
    success: true,
    minutes,
    ...result,
    ranAt: new Date().toISOString(),
    message:
      result.cleaned === 0
        ? `Nenhum pending com mais de ${minutes} min.`
        : `${result.cleaned} pedido(s) cancelado(s); ${result.ticketsReleased} ingresso(s) devolvido(s).`,
  });
}

export async function GET(req: NextRequest) {
  return runCleanup(req);
}

export async function POST(req: NextRequest) {
  return runCleanup(req);
}
