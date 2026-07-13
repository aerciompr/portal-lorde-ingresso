/**
 * Quais chaves de Setting podem ir para o browser SEM autenticação.
 * Secrets (MP access token, Stripe secret, etc.) NUNCA saem no GET público —
 * permanecem no banco e só no GET admin autenticado / getAppSettings no servidor.
 */

/** Branding + chaves publicáveis de gateway + taxas exibíveis + meios de pagamento (labels) */
export const PUBLIC_SETTING_KEYS = new Set([
  'site_name',
  'logo_url',
  'favicon_url',
  'banner_image_url',
  'banner_title',
  'banner_subtitle',
  'footer_left',
  'footer_right',
  'public_url',
  'from_email',
  'cancel_hours',
  'cancel_fee',
  'pending_order_ttl_minutes',
  'pix_fee_percent',
  'pix_fee_fixed_cents',
  'card_fee_percent',
  'card_fee_fixed_cents',
  // Só chaves públicas dos gateways
  'stripe_publishable_key',
  'mercadopago_public_key',
  'STRIPE_PUBLISHABLE_KEY',
  'MERCADOPAGO_PUBLIC_KEY',
  // Meios de pagamento (labels + provider — sem secrets)
  'pay_pix_enabled',
  'pay_pix_label',
  'pay_pix_hint',
  'pay_pix_provider',
  'pay_card_enabled',
  'pay_card_label',
  'pay_card_hint',
  'pay_card_provider',
  // Contato público
  'whatsapp_display',
  'whatsapp_e164',
  'contact_email',
  'instagram_url',
  'contact_note',
]);

/** Nunca devolver no GET público (mesmo se alguém listar) */
export const SECRET_SETTING_KEY_PATTERNS = [
  /secret/i,
  /access_token/i,
  /refresh_token/i,
  /password/i,
  /private/i,
  /webhook_secret/i,
  /client_secret/i,
  /api_key/i,
  /mercadopago_access/i,
  /stripe_secret/i,
  /stripe_access/i,
  /stripe_refresh/i,
  /resend/i,
];

export function isSecretSettingKey(key: string): boolean {
  return SECRET_SETTING_KEY_PATTERNS.some((re) => re.test(key));
}

export function filterPublicSettings(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isSecretSettingKey(k)) continue;
    if (PUBLIC_SETTING_KEYS.has(k) || PUBLIC_SETTING_KEYS.has(k.toLowerCase())) {
      out[k] = v;
    }
  }
  return out;
}

/** Remove hash de senha e campos sensíveis de pedidos na API do cliente */
export function sanitizeOrderForClient<T extends Record<string, unknown>>(
  order: T
): T & { hasPassword: boolean } {
  const { buyerPasswordHash: _h, ...rest } = order as T & { buyerPasswordHash?: unknown };
  return {
    ...rest,
    hasPassword: Boolean(_h),
  } as T & { hasPassword: boolean };
}

export function sanitizeOrdersForClient<T extends Record<string, unknown>>(orders: T[]): T[] {
  return orders.map((o) => sanitizeOrderForClient(o));
}
