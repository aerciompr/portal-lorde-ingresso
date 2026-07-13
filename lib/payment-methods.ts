/**
 * Meios de pagamento configuráveis no admin (labels + provedor + on/off).
 * Settings keys (string no banco):
 *  pay_pix_enabled, pay_pix_label, pay_pix_hint, pay_pix_provider
 *  pay_card_enabled, pay_card_label, pay_card_hint, pay_card_provider
 * provider: mercadopago | stripe
 */

export type PayProvider = 'mercadopago' | 'stripe';
export type PayMethodId = 'pix' | 'card';

export type PaymentMethodPublic = {
  id: PayMethodId;
  enabled: boolean;
  label: string;
  hint: string;
  provider: PayProvider;
};

const DEFAULTS: Record<PayMethodId, Omit<PaymentMethodPublic, 'id'>> = {
  pix: {
    enabled: true,
    label: 'PIX',
    hint: 'Aprovação na hora',
    provider: 'mercadopago',
  },
  card: {
    enabled: true,
    label: 'Cartão',
    hint: 'Crédito e débito',
    provider: 'stripe',
  },
};

function parseBool(v: string | undefined, fallback: boolean) {
  if (v == null || v === '') return fallback;
  const s = String(v).toLowerCase().trim();
  if (['0', 'false', 'off', 'no', 'nao', 'não'].includes(s)) return false;
  if (['1', 'true', 'on', 'yes', 'sim'].includes(s)) return true;
  return fallback;
}

function parseProvider(v: string | undefined, fallback: PayProvider): PayProvider {
  const s = (v || '').toLowerCase().trim();
  if (s === 'stripe' || s === 'mp' || s === 'mercadopago' || s === 'mercado_pago') {
    return s === 'stripe' ? 'stripe' : 'mercadopago';
  }
  return fallback;
}

/** Lê mapa de settings (raw key→value) e monta meios públicos. */
export function paymentMethodsFromRaw(raw: Record<string, string>): PaymentMethodPublic[] {
  const methods: PayMethodId[] = ['pix', 'card'];
  return methods.map((id) => {
    const d = DEFAULTS[id];
    return {
      id,
      enabled: parseBool(raw[`pay_${id}_enabled`], d.enabled),
      label: (raw[`pay_${id}_label`] || d.label).trim() || d.label,
      hint: (raw[`pay_${id}_hint`] || d.hint).trim() || d.hint,
      provider: parseProvider(raw[`pay_${id}_provider`], d.provider),
    };
  });
}

export function enabledPaymentMethods(raw: Record<string, string>): PaymentMethodPublic[] {
  return paymentMethodsFromRaw(raw).filter((m) => m.enabled);
}

export function resolvePayGateway(
  method: string | undefined,
  raw: Record<string, string>
): PayProvider {
  const id = (method === 'card' ? 'card' : 'pix') as PayMethodId;
  const m = paymentMethodsFromRaw(raw).find((x) => x.id === id);
  return m?.provider || DEFAULTS[id].provider;
}
