import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStripeForLoyalty } from '@/lib/loyalty-stripe';
import type Stripe from 'stripe';

/**
 * Cron: reconcilia LoyaltyMembership com o status real da assinatura no Stripe —
 * rede de segurança caso um webhook (checkout.session.completed / invoice.paid /
 * customer.subscription.*) tenha falhado. Mesmo esqueleto de sync-payments.
 * Auth: Bearer CRON_SECRET (igual sync-payments/cleanup-pending)
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

function mapSubscriptionStatus(s: Stripe.Subscription.Status): string {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due' || s === 'unpaid') return 'past_due';
  if (s === 'canceled' || s === 'incomplete_expired') return 'canceled';
  return 'pending';
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        hint: 'Defina CRON_SECRET e use Authorization: Bearer $CRON_SECRET ou ?secret=',
      },
      { status: 401 }
    );
  }

  const { stripe } = await getStripeForLoyalty();
  let checked = 0;
  let updated = 0;
  const errors: string[] = [];

  if (stripe) {
    const memberships = await prisma.loyaltyMembership.findMany({
      where: {
        stripeSubscriptionId: { not: null },
        status: { in: ['pending', 'active', 'past_due'] },
      },
      take: 200,
    });

    for (const m of memberships) {
      checked++;
      try {
        const subscription = await stripe.subscriptions.retrieve(m.stripeSubscriptionId!);
        const firstItem = subscription.items.data[0];
        const newStatus = mapSubscriptionStatus(subscription.status);
        const currentPeriodEnd = firstItem?.current_period_end
          ? new Date(firstItem.current_period_end * 1000)
          : m.currentPeriodEnd;
        const currentPeriodStart = firstItem?.current_period_start
          ? new Date(firstItem.current_period_start * 1000)
          : m.currentPeriodStart;

        const periodChanged =
          currentPeriodEnd?.getTime() !== m.currentPeriodEnd?.getTime();

        if (newStatus !== m.status || periodChanged) {
          await prisma.loyaltyMembership.update({
            where: { id: m.id },
            data: {
              status: newStatus,
              currentPeriodStart,
              currentPeriodEnd,
              canceledAt:
                newStatus === 'canceled' && !m.canceledAt ? new Date() : m.canceledAt,
              // Novo ciclo detectado pelo cron (webhook falhou) — zera cota também aqui.
              entriesUsedInPeriod: periodChanged ? 0 : m.entriesUsedInPeriod,
            },
          });
          updated++;
        }
      } catch (e: unknown) {
        errors.push(`${m.id}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }
  }

  const ranAt = new Date().toISOString();
  try {
    await prisma.setting.upsert({
      where: { key: 'cron_last_run_at_loyalty' },
      update: { value: ranAt },
      create: { key: 'cron_last_run_at_loyalty', value: ranAt },
    });
  } catch {
    /* ignore */
  }

  console.log(`[CRON sync-subscriptions] checked=${checked} updated=${updated}`);

  return NextResponse.json({
    success: true,
    checked,
    updated,
    errors: errors.slice(0, 10),
    ranAt,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
