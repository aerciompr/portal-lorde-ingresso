import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { finalizePaidOrder } from '@/lib/finalize-paid-order';

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

/**
 * Consulta o PaymentIntent no Stripe e, se succeeded, marca o pedido como pago.
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
  if (order.status === 'paid') {
    return { ok: true, status: 'paid', alreadyPaid: true };
  }
  if (order.status !== 'pending') {
    return { ok: false, status: order.status, error: `Status ${order.status}` };
  }

  const piId = (opts?.paymentIntentId || order.paymentId || '').trim();
  if (!piId || !piId.startsWith('pi_')) {
    return { ok: false, status: 'pending', error: 'Sem PaymentIntent no pedido' };
  }

  const client = await getStripeForPayments();
  if (!client) {
    return { ok: false, status: 'pending', error: 'Stripe não configurado' };
  }

  try {
    const pi = await client.stripe.paymentIntents.retrieve(
      piId,
      undefined,
      client.stripeOpts
    );
    const st = String(pi.status || '').toLowerCase();

    // Confirma que o PI é deste pedido (quando há metadata)
    const metaOrder = String(pi.metadata?.orderId || '').trim();
    if (metaOrder && metaOrder !== orderId) {
      return {
        ok: false,
        status: 'pending',
        stripeStatus: st,
        error: 'PaymentIntent de outro pedido',
      };
    }

    if (st === 'succeeded') {
      const r = await finalizePaidOrder(orderId, {
        paymentId: pi.id,
        paymentMethod: 'card',
        paymentGateway: 'stripe',
      });
      return {
        ok: r.ok,
        status: r.ok ? 'paid' : order.status,
        stripeStatus: st,
        finalized: r.ok && !r.alreadyPaid,
        alreadyPaid: r.alreadyPaid,
        error: r.error,
      };
    }

    return { ok: true, status: 'pending', stripeStatus: st };
  } catch (e) {
    return {
      ok: false,
      status: 'pending',
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

  // 1) Pedido que já tem este paymentId
  let order = await prisma.order.findFirst({
    where: { paymentId: piId },
    select: { id: true, status: true },
  });

  // 2) Metadata no Stripe
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
      if (order && String(pi.status).toLowerCase() === 'succeeded') {
        const r = await reconcileStripeOrder(order.id, { paymentIntentId: piId });
        return {
          ok: r.ok,
          orderId: order.id,
          status: r.status,
          error: r.error,
        };
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
 * Reconcilia vários pendentes de cartão (cron / admin).
 */
export async function reconcileAllPendingStripe(limit = 80): Promise<{
  checked: number;
  finalized: number;
  errors: string[];
}> {
  const pending = await prisma.order.findMany({
    where: {
      status: 'pending',
      // PaymentIntent Stripe sempre começa com pi_
      paymentId: { startsWith: 'pi_' },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    take: Math.min(200, Math.max(1, limit)),
    orderBy: { createdAt: 'asc' },
    select: { id: true, paymentId: true },
  });

  let finalized = 0;
  const errors: string[] = [];

  for (const o of pending) {
    const r = await reconcileStripeOrder(o.id, {
      paymentIntentId: o.paymentId || undefined,
    });
    if (r.finalized) finalized++;
    if (!r.ok && r.error) errors.push(`${o.id}: ${r.error}`);
  }

  return { checked: pending.length, finalized, errors: errors.slice(0, 20) };
}
