import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { finalizePaidOrder } from '@/lib/finalize-paid-order';
import { fetchStripeSettlement } from '@/lib/stripe-settlement';
import { releaseOrderStock } from '@/lib/order-stock';

export type StripeClients = {
  stripe: Stripe;
  stripeOpts: Stripe.RequestOptions | undefined;
};

export async function getStripeForPayments(): Promise<StripeClients | null> {
  const s = await getAppSettings();
  const key = (s.payment.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '').trim();
  const oauth = (s.payment.stripeAccessToken || '').trim();
  const accountId = (s.payment.stripeAccountId || '').trim();
  const useConnect = Boolean(oauth && accountId && oauth !== key);
  const apiKey = useConnect ? oauth : key;
  if (!apiKey) return null;
  return {
    stripe: new Stripe(apiKey),
    stripeOpts: useConnect ? { stripeAccount: accountId } : undefined,
  };
}

async function applyStripeSettlement(
  orderId: string,
  paymentIntentId: string,
  client: StripeClients
) {
  const settlement = await fetchStripeSettlement(client, paymentIntentId);
  if (!settlement) {
    return finalizePaidOrder(orderId, {
      paymentId: paymentIntentId,
      paymentMethod: 'card',
      paymentGateway: 'stripe',
    });
  }
  return finalizePaidOrder(orderId, {
    paymentId: paymentIntentId,
    paymentMethod: 'card',
    paymentGateway: 'stripe',
    grossCents: settlement.amountCents,
    feeCents: settlement.feeCents,
    netCents: settlement.netCents,
    feeDetails: settlement.feeDetails,
  });
}

/** Atualiza bruto/taxa/líquido com valores reais da Stripe (pedido já pago). */
export async function refreshStripeFeesForOrder(
  orderId: string
): Promise<{ ok: boolean; updated?: boolean; error?: string; netCents?: number }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, paymentId: true, paymentGateway: true },
  });
  if (!order) return { ok: false, error: 'Pedido não encontrado' };
  if (order.status !== 'paid' && order.status !== 'refunded') {
    return { ok: false, error: `Status ${order.status}` };
  }
  const piId = (order.paymentId || '').trim();
  if (!piId.startsWith('pi_')) return { ok: false, error: 'Sem PI Stripe' };

  const client = await getStripeForPayments();
  if (!client) return { ok: false, error: 'Stripe não configurado' };

  const settlement = await fetchStripeSettlement(client, piId);
  if (!settlement) return { ok: false, error: 'Sem balance_transaction ainda' };

  await prisma.order.update({
    where: { id: orderId },
    data: {
      grossCents: settlement.amountCents,
      feeCents: settlement.feeCents,
      netCents: settlement.netCents,
      feeDetails: settlement.feeDetails,
    },
  });
  return { ok: true, updated: true, netCents: settlement.netCents };
}

/**
 * Consulta o PaymentIntent no Stripe e, se succeeded, marca o pedido como pago.
 * Se canceled / refunded no Stripe, alinha o status no portal.
 */
export async function reconcileStripeOrder(
  orderId: string,
  opts?: { paymentIntentId?: string }
): Promise<{
  ok: boolean;
  status: string;
  stripeStatus?: string;
  finalized?: boolean;
  alreadyPaid?: boolean;
  cancelled?: boolean;
  feesUpdated?: boolean;
  error?: string;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      paymentId: true,
      paymentGateway: true,
      paymentMethod: true,
    },
  });
  if (!order) return { ok: false, status: 'missing', error: 'Pedido não encontrado' };

  const piId = (opts?.paymentIntentId || order.paymentId || '').trim();
  if (!piId || !piId.startsWith('pi_')) {
    return { ok: false, status: order.status, error: 'Sem PaymentIntent no pedido' };
  }

  const client = await getStripeForPayments();
  if (!client) {
    return { ok: false, status: order.status, error: 'Stripe não configurado' };
  }

  try {
    const pi = await client.stripe.paymentIntents.retrieve(
      piId,
      { expand: ['latest_charge'] },
      client.stripeOpts
    );
    const st = String(pi.status || '').toLowerCase();

    const metaOrder = String(pi.metadata?.orderId || '').trim();
    if (metaOrder && metaOrder !== orderId) {
      return {
        ok: false,
        status: order.status,
        stripeStatus: st,
        error: 'PaymentIntent de outro pedido',
      };
    }

    // Já pago: atualiza taxas reais se possível
    if (order.status === 'paid') {
      const fees = await refreshStripeFeesForOrder(orderId);
      return {
        ok: true,
        status: 'paid',
        alreadyPaid: true,
        stripeStatus: st,
        feesUpdated: fees.updated,
      };
    }

    if (order.status === 'refunded' || order.status === 'cancelled') {
      return { ok: true, status: order.status, stripeStatus: st };
    }

    if (order.status !== 'pending') {
      return { ok: false, status: order.status, error: `Status ${order.status}` };
    }

    if (st === 'succeeded') {
      // Charge totalmente reembolsado?
      const charge =
        typeof pi.latest_charge === 'object' && pi.latest_charge
          ? (pi.latest_charge as Stripe.Charge)
          : null;
      if (charge && charge.refunded) {
        await releaseOrderStock(orderId);
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'refunded',
            paymentId: pi.id,
            paymentGateway: 'stripe',
            paymentMethod: 'card',
            feeDetails: 'Stripe: charge reembolsado',
          },
        });
        return { ok: true, status: 'refunded', stripeStatus: st, cancelled: true };
      }

      const r = await applyStripeSettlement(orderId, pi.id, client);
      return {
        ok: r.ok,
        status: r.ok ? 'paid' : order.status,
        stripeStatus: st,
        finalized: r.ok && !r.alreadyPaid,
        alreadyPaid: r.alreadyPaid,
        error: r.error,
      };
    }

    if (st === 'canceled' || st === 'cancelled') {
      await releaseOrderStock(orderId);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'cancelled',
          paymentId: pi.id,
          paymentGateway: 'stripe',
          paymentMethod: 'card',
          feeDetails: 'Stripe: payment_intent cancelado',
        },
      });
      return { ok: true, status: 'cancelled', stripeStatus: st, cancelled: true };
    }

    // requires_payment_method após falha / abandono com cancelamento no dashboard
    if (st === 'requires_payment_method') {
      const charge =
        typeof pi.latest_charge === 'object' && pi.latest_charge
          ? (pi.latest_charge as Stripe.Charge)
          : null;
      if (charge?.status === 'failed' || charge?.refunded) {
        // ainda pending — cleanup trata
      }
    }

    return { ok: true, status: 'pending', stripeStatus: st };
  } catch (e) {
    return {
      ok: false,
      status: order.status,
      error: e instanceof Error ? e.message : 'Erro Stripe',
    };
  }
}

/** Finaliza a partir do PI (retorno Stripe / webhook sem orderId no metadata). */
export async function reconcileByPaymentIntent(paymentIntentId: string): Promise<{
  ok: boolean;
  orderId?: string;
  status?: string;
  error?: string;
}> {
  const piId = String(paymentIntentId || '').trim();
  if (!piId.startsWith('pi_')) {
    return { ok: false, error: 'payment_intent inválido' };
  }

  let order = await prisma.order.findFirst({
    where: { paymentId: piId },
    select: { id: true, status: true },
  });

  if (!order) {
    const client = await getStripeForPayments();
    if (!client) return { ok: false, error: 'Stripe não configurado' };
    try {
      const pi = await client.stripe.paymentIntents.retrieve(
        piId,
        undefined,
        client.stripeOpts
      );
      const orderId = String(pi.metadata?.orderId || '').trim();
      if (orderId) {
        order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true, status: true },
        });
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Erro Stripe' };
    }
  }

  if (!order) return { ok: false, error: 'Pedido não encontrado para este pagamento' };

  const r = await reconcileStripeOrder(order.id, { paymentIntentId: piId });
  return { ok: r.ok, orderId: order.id, status: r.status, error: r.error };
}

/**
 * Reconcilia vários pendentes de cartão + atualiza taxas de pagos recentes.
 */
export async function reconcileAllPendingStripe(limit = 80): Promise<{
  checked: number;
  finalized: number;
  cancelled: number;
  feesUpdated: number;
  errors: string[];
}> {
  const pending = await prisma.order.findMany({
    where: {
      status: 'pending',
      paymentId: { startsWith: 'pi_' },
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    take: Math.min(200, Math.max(1, limit)),
    orderBy: { createdAt: 'asc' },
    select: { id: true, paymentId: true },
  });

  let finalized = 0;
  let cancelled = 0;
  let feesUpdated = 0;
  const errors: string[] = [];

  for (const o of pending) {
    const r = await reconcileStripeOrder(o.id, {
      paymentIntentId: o.paymentId || undefined,
    });
    if (r.finalized) finalized++;
    if (r.cancelled) cancelled++;
    if (!r.ok && r.error) errors.push(`${o.id}: ${r.error}`);
  }

  // Atualiza líquido real de pagos Stripe recentes
  const paid = await prisma.order.findMany({
    where: {
      status: { in: ['paid', 'refunded'] },
      paymentId: { startsWith: 'pi_' },
      paidAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    take: 50,
    orderBy: { paidAt: 'desc' },
    select: { id: true },
  });

  for (const o of paid) {
    const f = await refreshStripeFeesForOrder(o.id);
    if (f.updated) feesUpdated++;
  }

  return {
    checked: pending.length,
    finalized,
    cancelled,
    feesUpdated,
    errors: errors.slice(0, 20),
  };
}
