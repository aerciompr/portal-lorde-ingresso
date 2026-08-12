import Stripe from 'stripe';
import { getAppSettings } from '@/lib/settings';

/**
 * Mesma lógica de getPaymentClients() em app/api/orders/pay/route.ts:
 * chaves diretas por padrão, Connect só se houver access_token OAuth real.
 * Reaproveitado pelo endpoint de assinatura e pelo cron de reconciliação do clube.
 */
export async function getStripeForLoyalty() {
  const s = await getAppSettings();
  const STRIPE_SECRET = (s.payment.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '').trim();
  const STRIPE_ACCOUNT_ID = (s.payment.stripeAccountId || '').trim();
  const oauthToken = (s.payment.stripeAccessToken || '').trim();
  const useConnect = Boolean(oauthToken && STRIPE_ACCOUNT_ID && oauthToken !== STRIPE_SECRET);
  const stripeApiKey = useConnect ? oauthToken : STRIPE_SECRET;
  const stripe = stripeApiKey ? new Stripe(stripeApiKey) : null;
  const appUrl = (
    s.publicUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  return { stripe, useConnect, stripeAccountId: useConnect ? STRIPE_ACCOUNT_ID : '', appUrl };
}
