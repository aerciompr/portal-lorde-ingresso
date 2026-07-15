import { NextRequest, NextResponse } from 'next/server';
import { requireAdminMutation } from '@/lib/request-security';
import { reconcileAllPendingStripe } from '@/lib/stripe-reconcile';
import { cleanupPendingOrders } from '@/lib/order-stock';
import { getAppSettings } from '@/lib/settings';
import { finalizePaidOrder } from '@/lib/finalize-paid-order';
import { releaseOrderStock } from '@/lib/order-stock';
import { prisma } from '@/lib/prisma';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { performAutomaticVirada } from '@/lib/lote-virada';

/**
 * POST — roda manualmente o que os crons fariam (sem precisar de CRON_SECRET externo).
 * 1) Stripe pending → paid/cancelled + taxas reais
 * 2) PIX pending → MP
 * 3) Cleanup pending abandonados
 * 4) Viradas de lote
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const s = await getAppSettings();
  const summary: Record<string, unknown> = {
    ranAt: new Date().toISOString(),
  };

  // 0) Alertas de lote quase esgotado (≤2 → e-mail)
  try {
    const { scanLowStockAlerts } = await import('@/lib/lote-stock-alerts');
    summary.loteAlerts = await scanLowStockAlerts();
  } catch (e) {
    summary.loteAlertsError = e instanceof Error ? e.message : 'erro';
  }

  // 1) Stripe
  try {
    const stripe = await reconcileAllPendingStripe(100);
    summary.stripe = stripe;
  } catch (e) {
    summary.stripeError = e instanceof Error ? e.message : 'erro';
  }

  // 2) PIX MP
  let pixFinalized = 0;
  let pixCancelled = 0;
  const pixErrors: string[] = [];
  try {
    const token = s.payment.mpAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    if (token) {
      const pending = await prisma.order.findMany({
        where: {
          status: 'pending',
          paymentGateway: 'mercadopago',
          paymentId: { not: null },
          createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
        take: 80,
      });
      const client = new MercadoPagoConfig({ accessToken: token });
      const paymentApi = new Payment(client);
      for (const order of pending) {
        try {
          const result: unknown = await paymentApi.get({ id: String(order.paymentId) });
          const data = (result as { body?: { status?: string }; status?: string })?.body || result;
          const mpStatus = String(
            (data as { status?: string })?.status || ''
          ).toLowerCase();
          if (mpStatus === 'approved' || mpStatus === 'accredited') {
            const r = await finalizePaidOrder(order.id, {
              paymentId: String(order.paymentId),
              paymentMethod: 'pix',
              paymentGateway: 'mercadopago',
            });
            if (r.ok) pixFinalized++;
          } else if (['rejected', 'cancelled', 'canceled', 'expired'].includes(mpStatus)) {
            await releaseOrderStock(order.id);
            await prisma.order.update({
              where: { id: order.id },
              data: { status: 'cancelled', feeDetails: `mp sync: ${mpStatus}` },
            });
            pixCancelled++;
          }
        } catch (e) {
          pixErrors.push(`${order.id}: ${e instanceof Error ? e.message : 'erro'}`);
        }
      }
      summary.pix = {
        checked: pending.length,
        finalized: pixFinalized,
        cancelled: pixCancelled,
        errors: pixErrors.slice(0, 5),
      };
    } else {
      summary.pix = { skipped: true, reason: 'MP token ausente' };
    }
  } catch (e) {
    summary.pixError = e instanceof Error ? e.message : 'erro';
  }

  // 3) Cleanup (com checagem Stripe dentro de cleanupPendingOrders)
  try {
    const cleanup = await cleanupPendingOrders({
      minutes: s.pendingOrderTtlMinutes || 30,
    });
    const { repairCancelledOrdersStock } = await import('@/lib/order-stock');
    const repair = await repairCancelledOrdersStock();
    summary.cleanup = { ...cleanup, repair };
  } catch (e) {
    summary.cleanupError = e instanceof Error ? e.message : 'erro';
  }

  // 4) Viradas
  let viradas = 0;
  try {
    const events = await prisma.event.findMany({
      where: { activeLoteId: { not: null } },
      select: { id: true },
    });
    for (const ev of events) {
      const r = await performAutomaticVirada(ev.id);
      if (r.turned) viradas++;
    }
    summary.viradas = viradas;
  } catch (e) {
    summary.viradasError = e instanceof Error ? e.message : 'erro';
  }

  const stripe = summary.stripe as
    | { finalized?: number; cancelled?: number; feesUpdated?: number }
    | undefined;

  const ranAt = new Date().toISOString();
  try {
    await prisma.setting.upsert({
      where: { key: 'cron_last_run_at' },
      update: { value: ranAt },
      create: { key: 'cron_last_run_at', value: ranAt },
    });
    await prisma.setting.upsert({
      where: { key: 'cron_last_run_source' },
      update: { value: 'admin-run-crons' },
      create: { key: 'cron_last_run_source', value: 'admin-run-crons' },
    });
  } catch {
    /* ignore */
  }

  const cleanup = summary.cleanup as
    | { cleaned?: number; ticketsReleased?: number; repair?: { fixed?: number } }
    | undefined;

  return NextResponse.json({
    success: true,
    ranAt,
    ...summary,
    message: [
      `Stripe: +${stripe?.finalized ?? 0} pagos, ${stripe?.cancelled ?? 0} cancelados, ${stripe?.feesUpdated ?? 0} taxas`,
      `PIX: +${pixFinalized} pagos, ${pixCancelled} cancelados`,
      `Cleanup: ${cleanup?.cleaned ?? 0} cancelados, ${cleanup?.ticketsReleased ?? 0} estoque`,
      cleanup?.repair?.fixed
        ? `Reparo: ${cleanup.repair.fixed} cancelados com estoque preso`
        : null,
      `Viradas: ${viradas}`,
    ]
      .filter(Boolean)
      .join(' · '),
  });
}
