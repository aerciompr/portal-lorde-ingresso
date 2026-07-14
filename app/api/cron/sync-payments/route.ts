import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { finalizePaidOrder } from '@/lib/finalize-paid-order';
import { releaseOrderStock } from '@/lib/order-stock';
import { performAutomaticVirada } from '@/lib/lote-virada';
import { MercadoPagoConfig, Payment } from 'mercadopago';

/**
 * Cron: reconcilia pending com Mercado Pago + Stripe; viradas de lote.
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

  // 2) Sync Stripe pending (últimas 48h)
  const stripePending = await prisma.order.findMany({
    where: {
      status: 'pending',
      paymentGateway: 'stripe',
      paymentId: { not: null },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    take: 80,
    orderBy: { createdAt: 'asc' },
  });

  if (stripePending.length > 0) {
    const key = (s.payment.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '').trim();
    const oauth = (s.payment.stripeAccessToken || '').trim();
    const accountId = (s.payment.stripeAccountId || '').trim();
    const useConnect = Boolean(oauth && accountId && oauth !== key);
    const apiKey = useConnect ? oauth : key;
    if (apiKey) {
      const stripe = new Stripe(apiKey);
      const opts = useConnect ? { stripeAccount: accountId } : undefined;
      for (const order of stripePending) {
        try {
          const pi = await stripe.paymentIntents.retrieve(String(order.paymentId), opts);
          const st = String(pi.status || '').toLowerCase();
          if (st === 'succeeded') {
            const r = await finalizePaidOrder(order.id, {
              paymentId: pi.id,
              paymentMethod: 'card',
              paymentGateway: 'stripe',
            });
            if (r.ok) finalized++;
          } else if (st === 'canceled' || st === 'cancelled') {
            await releaseOrderStock(order.id);
            await prisma.order.update({
              where: { id: order.id },
              data: { status: 'cancelled', feeDetails: `stripe sync: ${st}` },
            });
            cancelled++;
          }
        } catch (e: unknown) {
          errors.push(`stripe ${order.id}: ${e instanceof Error ? e.message : 'erro'}`);
        }
      }
    }
  }

  // 3) Virada automática em eventos com lote ativo esgotado
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
