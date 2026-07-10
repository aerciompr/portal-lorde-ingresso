import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { finalizePaidOrder } from '@/lib/finalize-paid-order';
import { releaseOrderStock } from '@/lib/order-stock';
import { performAutomaticVirada } from '@/lib/lote-virada';
import { MercadoPagoConfig, Payment } from 'mercadopago';

/**
 * Cron: reconcilia pedidos pending com Mercado Pago e tenta viradas de lote pendentes.
 * Auth: Bearer CRON_SECRET (igual cleanup-pending)
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_CRON_SECRET || '';
  if (!secret && process.env.NODE_ENV !== 'production') return true;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get('x-cron-secret') === secret) return true;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const s = await getAppSettings();
  const token = s.payment.mpAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';

  let finalized = 0;
  let cancelled = 0;
  let viradas = 0;
  const errors: string[] = [];

  // 1) Sync PIX pending (últimas 48h, com paymentId)
  const pending = await prisma.order.findMany({
    where: {
      status: 'pending',
      paymentGateway: 'mercadopago',
      paymentId: { not: null },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    take: 80,
    orderBy: { createdAt: 'asc' },
  });

  if (token && pending.length > 0) {
    const client = new MercadoPagoConfig({ accessToken: token });
    const paymentApi = new Payment(client);

    for (const order of pending) {
      try {
        const result: any = await paymentApi.get({ id: String(order.paymentId) });
        const data = result?.body || result;
        const mpStatus = String(data?.status || '').toLowerCase();

        if (mpStatus === 'approved' || mpStatus === 'accredited') {
          const r = await finalizePaidOrder(order.id, {
            paymentId: String(order.paymentId),
            paymentMethod: 'pix',
            paymentGateway: 'mercadopago',
          });
          if (r.ok) finalized++;
        } else if (['rejected', 'cancelled', 'canceled', 'expired'].includes(mpStatus)) {
          await releaseOrderStock(order.id);
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'cancelled', feeDetails: `mp sync: ${mpStatus}` },
          });
          cancelled++;
        }
      } catch (e: unknown) {
        errors.push(`${order.id}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }
  }

  // 2) Virada automática em eventos com lote ativo esgotado
  const eventsWithActive = await prisma.event.findMany({
    where: { activeLoteId: { not: null } },
    select: { id: true },
  });

  for (const ev of eventsWithActive) {
    try {
      const r = await performAutomaticVirada(ev.id);
      if (r.turned) viradas++;
    } catch (e: unknown) {
      errors.push(`virada ${ev.id}: ${e instanceof Error ? e.message : 'erro'}`);
    }
  }

  console.log(
    `[CRON sync-payments] finalized=${finalized} cancelled=${cancelled} viradas=${viradas}`
  );

  return NextResponse.json({
    success: true,
    finalized,
    cancelled,
    viradas,
    pendingChecked: pending.length,
    errors: errors.slice(0, 10),
    ranAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
