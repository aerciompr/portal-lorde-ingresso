import { prisma } from './prisma';
import { trackingFromRaw, TRACKING_DEFAULTS, type TrackingSettings } from './tracking';

export type GatewayFees = {
  pixPercent: number;
  pixFixedCents: number;
  cardPercent: number;
  cardFixedCents: number;
};

export type AppSettings = {
  fees: GatewayFees;
  fromEmail: string;
  cancelHours: number;
  cancelFeePercent: number;
  /** Minutos para expirar pedidos pending e devolver estoque (cron / limpeza). */
  pendingOrderTtlMinutes: number;
  publicUrl: string;   // para webhooks, links em emails e notification_url (ex: https://seudominio.com ou ngrok)
  payment: {
    stripePublishableKey: string;
    stripeSecretKey: string;
    // Stripe Connect OAuth
    stripeClientId?: string;       // ca_... from Stripe Connect settings
    stripeAccountId?: string;      // acct_xxx
    stripeAccessToken?: string;    // sk_... or access token from OAuth
    stripeRefreshToken?: string;
    // MP
    mpPublicKey: string;
    mpAccessToken: string;
    mpClientId: string;
    mpClientSecret: string;
  };
  branding: {
    logoUrl: string;
    faviconUrl: string;
    siteName: string;
    bannerImageUrl: string;
    bannerTitle: string;
    bannerSubtitle: string;
    footerLeft: string;
    footerRight: string;
    /** JSON widgets do rodapé (opcional) */
    footerLayout: string;
  };
  contact: {
    whatsappDisplay: string;
    whatsappE164: string;
    /** E-mail público exibido e destino do formulário de contato */
    contactEmail: string;
    instagramUrl: string;
    contactNote: string;
  };
  /** Pixels (Meta/GA/GTM) + HTML custom no head/body */
  tracking: TrackingSettings;
};

// Default values (safe fallbacks)
const DEFAULTS: AppSettings = {
  fees: {
    pixPercent: 1.99,
    pixFixedCents: 0,
    cardPercent: 3.99,
    cardFixedCents: 49,
  },
  fromEmail: 'ingressos@lordenelson.com.br',
  cancelHours: 12,
  cancelFeePercent: 10,
  pendingOrderTtlMinutes: 30,
  publicUrl: '',
  payment: {
    stripePublishableKey: '',
    stripeSecretKey: '',
    stripeClientId: '',
    stripeAccountId: '',
    stripeAccessToken: '',
    stripeRefreshToken: '',
    mpPublicKey: '',
    mpAccessToken: '',
    mpClientId: '',
    mpClientSecret: '',
  },
  branding: {
    // Fallback se o admin ainda não configurou logo (arquivo em /public)
    logoUrl: '/logo-lordenelson.jpg',
    faviconUrl: '',
    siteName: 'Lorde Nelson',
    bannerImageUrl: '',
    bannerTitle: 'LORDE NELSON',
    bannerSubtitle: 'Rest Pub • Shows, forró e grandes jogos. Compre seu ingresso agora.',
    footerLeft:
      'Lorde Nelson Rest Pub\nRua Silvério Jorge, 241\nJaraguá — Maceió/AL\n\nQui a Sáb\n20h às 02h',
    footerRight:
      '© {year} Lorde Nelson\nPortal de ingressos.\n\nCheck-in no local',
    footerLayout: '',
  },
  contact: {
    whatsappDisplay: '(82) 99647-1998',
    whatsappE164: '5582996471998',
    contactEmail: 'contato@lordenelson.com.br',
    instagramUrl: '',
    contactNote: 'Respondemos em horário comercial. Para ingressos, use também Meus Ingressos.',
  },
  tracking: { ...TRACKING_DEFAULTS },
};

let cachedSettings: AppSettings | null = null;
let lastFetch = 0;
const CACHE_TTL = 60_000; // 1 minute

async function loadRawSettings(): Promise<Record<string, string>> {
  try {
    const rows = await prisma.setting.findMany();
    const obj: Record<string, string> = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    return obj;
  } catch {
    return {};
  }
}

export async function getAppSettings(force = false): Promise<AppSettings> {
  const now = Date.now();
  if (!force && cachedSettings && (now - lastFetch) < CACHE_TTL) {
    return cachedSettings;
  }

  const raw = await loadRawSettings();

  const fees: GatewayFees = {
    pixPercent: parseFloat(raw.pix_fee_percent ?? DEFAULTS.fees.pixPercent.toString()) || DEFAULTS.fees.pixPercent,
    pixFixedCents: parseInt(raw.pix_fee_fixed_cents ?? DEFAULTS.fees.pixFixedCents.toString(), 10) || DEFAULTS.fees.pixFixedCents,
    cardPercent: parseFloat(raw.card_fee_percent ?? DEFAULTS.fees.cardPercent.toString()) || DEFAULTS.fees.cardPercent,
    cardFixedCents: parseInt(raw.card_fee_fixed_cents ?? DEFAULTS.fees.cardFixedCents.toString(), 10) || DEFAULTS.fees.cardFixedCents,
  };

  const settings: AppSettings = {
    fees,
    fromEmail: raw.from_email || DEFAULTS.fromEmail,
    cancelHours: parseInt(raw.cancel_hours ?? raw.cancelHours ?? DEFAULTS.cancelHours.toString(), 10) || DEFAULTS.cancelHours,
    cancelFeePercent: parseFloat(raw.cancel_fee ?? raw.cancelFee ?? DEFAULTS.cancelFeePercent.toString()) || DEFAULTS.cancelFeePercent,
    pendingOrderTtlMinutes: Math.max(
      5,
      parseInt(raw.pending_order_ttl_minutes ?? DEFAULTS.pendingOrderTtlMinutes.toString(), 10) || DEFAULTS.pendingOrderTtlMinutes
    ),
    publicUrl: raw.public_url || raw.NEXT_PUBLIC_APP_URL || DEFAULTS.publicUrl,
    payment: {
      stripePublishableKey: raw.stripe_publishable_key || raw.STRIPE_PUBLISHABLE_KEY || DEFAULTS.payment.stripePublishableKey,
      stripeSecretKey: raw.stripe_secret_key || raw.STRIPE_SECRET_KEY || DEFAULTS.payment.stripeSecretKey,
      stripeClientId: raw.stripe_client_id || raw.STRIPE_CLIENT_ID || DEFAULTS.payment.stripeClientId,
      stripeAccountId: raw.stripe_account_id || raw.STRIPE_ACCOUNT_ID || DEFAULTS.payment.stripeAccountId,
      stripeAccessToken: raw.stripe_access_token || raw.STRIPE_ACCESS_TOKEN || DEFAULTS.payment.stripeAccessToken,
      stripeRefreshToken: raw.stripe_refresh_token || raw.STRIPE_REFRESH_TOKEN || DEFAULTS.payment.stripeRefreshToken,
      mpPublicKey: raw.mercadopago_public_key || raw.MERCADOPAGO_PUBLIC_KEY || DEFAULTS.payment.mpPublicKey,
      mpAccessToken: raw.mercadopago_access_token || raw.MERCADOPAGO_ACCESS_TOKEN || DEFAULTS.payment.mpAccessToken,
      mpClientId: raw.mercadopago_client_id || raw.MERCADOPAGO_CLIENT_ID || DEFAULTS.payment.mpClientId,
      mpClientSecret: raw.mercadopago_client_secret || raw.MERCADOPAGO_CLIENT_SECRET || DEFAULTS.payment.mpClientSecret,
    },
    branding: {
      logoUrl: raw.logo_url || raw.LOGO_URL || DEFAULTS.branding.logoUrl,
      faviconUrl: raw.favicon_url || raw.FAVICON_URL || DEFAULTS.branding.faviconUrl,
      siteName: raw.site_name || raw.SITE_NAME || DEFAULTS.branding.siteName,
      bannerImageUrl: raw.banner_image_url || raw.BANNER_IMAGE_URL || DEFAULTS.branding.bannerImageUrl,
      bannerTitle: raw.banner_title || raw.BANNER_TITLE || DEFAULTS.branding.bannerTitle,
      bannerSubtitle: raw.banner_subtitle || raw.BANNER_SUBTITLE || DEFAULTS.branding.bannerSubtitle,
      footerLeft: raw.footer_left || raw.FOOTER_LEFT || DEFAULTS.branding.footerLeft,
      footerRight: raw.footer_right || raw.FOOTER_RIGHT || DEFAULTS.branding.footerRight,
      footerLayout: raw.footer_layout || raw.FOOTER_LAYOUT || DEFAULTS.branding.footerLayout,
    },
    contact: {
      whatsappDisplay:
        raw.whatsapp_display || raw.WHATSAPP_DISPLAY || DEFAULTS.contact.whatsappDisplay,
      whatsappE164: (
        raw.whatsapp_e164 ||
        raw.WHATSAPP_E164 ||
        DEFAULTS.contact.whatsappE164
      ).replace(/\D/g, ''),
      contactEmail:
        raw.contact_email ||
        raw.CONTACT_EMAIL ||
        raw.from_email ||
        DEFAULTS.contact.contactEmail,
      instagramUrl: (raw.instagram_url || raw.INSTAGRAM_URL || DEFAULTS.contact.instagramUrl).trim(),
      contactNote: raw.contact_note || DEFAULTS.contact.contactNote,
    },
    tracking: trackingFromRaw(raw),
  };

  cachedSettings = settings;
  lastFetch = now;
  return settings;
}

export async function saveAppSettings(data: Partial<Record<string, string | number>>) {
  const toSave: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) {
      toSave[k] = String(v);
    }
  }

  for (const [key, value] of Object.entries(toSave)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  // Invalidate cache
  cachedSettings = null;
}

export async function getFeeForMethod(method: 'pix' | 'card' | string): Promise<{ percent: number; fixedCents: number; details: string }> {
  const s = await getAppSettings();
  const isPix = method === 'pix';
  const percent = isPix ? s.fees.pixPercent : s.fees.cardPercent;
  const fixed = isPix ? s.fees.pixFixedCents : s.fees.cardFixedCents;
  const fixedLabel = (fixed / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
  const details = `${isPix ? 'pix' : 'card'} ${percent.toLocaleString('pt-BR')}% + ${fixedLabel}`;
  return { percent, fixedCents: fixed, details };
}

// Invalidate settings cache (call after admin updates keys)
export function bustSettingsCache() {
  cachedSettings = null;
}
