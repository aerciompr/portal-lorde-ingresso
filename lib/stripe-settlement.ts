import type Stripe from 'stripe';

export type StripeSettlement = {
  /** Valor cobrado do cliente (centavos) */
  amountCents: number;
  /** Taxa Stripe (centavos) — o que a Stripe retém */
  feeCents: number;
  /** Líquido que cai na conta (amount - fee) — pode ser negativo em valores baixos */
  netCents: number;
  currency: string;
  feeDetails: string;
  balanceTransactionId?: string;
};

type StripeClientLike = {
  stripe: Stripe;
  stripeOpts?: Stripe.RequestOptions;
};

/**
 * Busca taxa real e líquido da Stripe (balance_transaction do charge).
 * Em cobranças muito baixas (ex. R$ 0,50) o líquido pode ser negativo.
 */
export async function fetchStripeSettlement(
  client: StripeClientLike,
  paymentIntentId: string
): Promise<StripeSettlement | null> {
  try {
    const pi = await client.stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ['latest_charge.balance_transaction'] },
      client.stripeOpts
    );

    const amountCents = pi.amount_received || pi.amount || 0;
    let charge: Stripe.Charge | null = null;
    const lc = pi.latest_charge;
    if (typeof lc === 'string') {
      charge = await client.stripe.charges.retrieve(
        lc,
        { expand: ['balance_transaction'] },
        client.stripeOpts
      );
    } else if (lc && typeof lc === 'object') {
      charge = lc as Stripe.Charge;
    }

    let feeCents = 0;
    let netCents = amountCents;
    let btId: string | undefined;
    let feeDetailParts: string[] = [];

    const btRaw = charge?.balance_transaction;
    let bt: Stripe.BalanceTransaction | null = null;
    if (typeof btRaw === 'string') {
      bt = await client.stripe.balanceTransactions.retrieve(
        btRaw,
        undefined,
        client.stripeOpts
      );
    } else if (btRaw && typeof btRaw === 'object') {
      bt = btRaw as Stripe.BalanceTransaction;
    }

    if (bt) {
      feeCents = Math.abs(bt.fee || 0);
      netCents = bt.net;
      btId = bt.id;
      if (Array.isArray(bt.fee_details) && bt.fee_details.length) {
        feeDetailParts = bt.fee_details.map((f) => {
          const type = f.type || 'fee';
          const desc = f.description || type;
          const amt = ((f.amount || 0) / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: (f.currency || 'brl').toUpperCase(),
          });
          return `${desc}: ${amt}`;
        });
      }
    } else if (charge?.amount != null) {
      netCents = charge.amount - (charge.application_fee_amount || 0);
    }

    const feeLabel =
      feeDetailParts.length > 0
        ? feeDetailParts.join(' · ')
        : feeCents > 0
          ? `taxa Stripe ${((feeCents || 0) / 100).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}`
          : 'taxa Stripe (pendente na balance)';

    return {
      amountCents,
      feeCents,
      netCents,
      currency: (pi.currency || 'brl').toLowerCase(),
      feeDetails: `Stripe real: ${feeLabel} · líquido ${((netCents || 0) / 100).toLocaleString(
        'pt-BR',
        { style: 'currency', currency: 'BRL' }
      )}`.slice(0, 250),
      balanceTransactionId: btId,
    };
  } catch (e) {
    console.warn(
      '[STRIPE settlement]',
      paymentIntentId,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
