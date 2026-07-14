/**
 * Pixels e scripts de marketing (admin → Settings).
 * IDs são sanitizados; HTML custom é só injetado server-side (admin confia).
 */

export type TrackingSettings = {
  /** Meta / Facebook Pixel — só números (ex: 1234567890) */
  metaPixelId: string;
  /** Google Analytics 4 — G-XXXXXXXX */
  googleAnalyticsId: string;
  /** Google Tag Manager — GTM-XXXXXXX */
  googleTagManagerId: string;
  /** HTML/scripts extras no &lt;head&gt; */
  headHtml: string;
  /** HTML/scripts no fim do &lt;body&gt; */
  bodyHtml: string;
  /** 1 = ativo, 0 = desliga todos os pixels/scripts */
  enabled: boolean;
};

export const TRACKING_DEFAULTS: TrackingSettings = {
  metaPixelId: '',
  googleAnalyticsId: '',
  googleTagManagerId: '',
  headHtml: '',
  bodyHtml: '',
  enabled: true,
};

/** Chaves no banco (Setting.key) */
export const TRACKING_SETTING_KEYS = {
  enabled: 'tracking_enabled',
  metaPixelId: 'meta_pixel_id',
  googleAnalyticsId: 'google_analytics_id',
  googleTagManagerId: 'google_tag_manager_id',
  headHtml: 'head_scripts_html',
  bodyHtml: 'body_scripts_html',
} as const;

const MAX_HTML_LEN = 80_000;

export function sanitizeMetaPixelId(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\D/g, '')
    .slice(0, 32);
}

export function sanitizeGaId(raw: string): string {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s/g, '');
  // G-XXXX / AW-XXXX / GT-XXXX
  if (/^(G|AW|GT)-[A-Z0-9]+$/.test(s)) return s.slice(0, 32);
  return '';
}

export function sanitizeGtmId(raw: string): string {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s/g, '');
  if (/^GTM-[A-Z0-9]+$/.test(s)) return s.slice(0, 24);
  return '';
}

export function clampHtml(raw: string): string {
  const s = String(raw || '');
  if (s.length <= MAX_HTML_LEN) return s;
  return s.slice(0, MAX_HTML_LEN);
}

export function trackingFromRaw(raw: Record<string, string>): TrackingSettings {
  const en = String(raw.tracking_enabled ?? '1').toLowerCase();
  return {
    enabled: !['0', 'false', 'off', 'no'].includes(en),
    metaPixelId: sanitizeMetaPixelId(raw.meta_pixel_id || ''),
    googleAnalyticsId: sanitizeGaId(raw.google_analytics_id || ''),
    googleTagManagerId: sanitizeGtmId(raw.google_tag_manager_id || ''),
    headHtml: clampHtml(raw.head_scripts_html || ''),
    bodyHtml: clampHtml(raw.body_scripts_html || ''),
  };
}

export function hasAnyTracking(t: TrackingSettings): boolean {
  if (!t.enabled) return false;
  return Boolean(
    t.metaPixelId ||
      t.googleAnalyticsId ||
      t.googleTagManagerId ||
      t.headHtml.trim() ||
      t.bodyHtml.trim()
  );
}
