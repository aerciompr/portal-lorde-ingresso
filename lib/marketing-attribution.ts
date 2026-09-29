/**
 * Dados não sensíveis que identificam a origem da visita.
 * Ficam no sessionStorage para acompanhar o visitante até o checkout, sem cookies
 * de identificação e sem guardar nome, e-mail, CPF ou telefone.
 */
export type MarketingAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  landingPage?: string;
  referrer?: string;
};

const STORAGE_KEY = 'ln-marketing-attribution-v1';
const MAX_VALUE_LENGTH = 255;

function clean(value: string | null | undefined, max = MAX_VALUE_LENGTH) {
  return String(value || '').trim().slice(0, max);
}

/** Lê a primeira entrada e atualiza UTMs quando uma nova campanha é informada. */
export function getMarketingAttribution(): MarketingAttribution {
  if (typeof window === 'undefined') return {};

  let saved: MarketingAttribution = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') as MarketingAttribution;
  } catch {
    // storage privado/indisponível não pode bloquear uma compra
  }

  const query = new URLSearchParams(window.location.search);
  const incoming: MarketingAttribution = {
    utmSource: clean(query.get('utm_source')),
    utmMedium: clean(query.get('utm_medium')),
    utmCampaign: clean(query.get('utm_campaign')),
    utmContent: clean(query.get('utm_content')),
    utmTerm: clean(query.get('utm_term')),
    gclid: clean(query.get('gclid')),
    fbclid: clean(query.get('fbclid')),
  };
  const hasCampaign = Boolean(
    incoming.utmSource || incoming.utmMedium || incoming.utmCampaign || incoming.gclid || incoming.fbclid
  );

  const next: MarketingAttribution = {
    ...saved,
    ...(hasCampaign ? incoming : {}),
    landingPage: saved.landingPage || clean(window.location.pathname + window.location.search, 500),
    referrer: saved.referrer || clean(document.referrer, 500),
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // idem: tracking é opcional e nunca impede o checkout
  }
  return next;
}
