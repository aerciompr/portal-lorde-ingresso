/**
 * Contato público do portal.
 * Fonte da verdade em produção: Settings no admin (whatsapp_*, contact_email, show_whatsapp).
 * Estes valores são só fallback de seed / dev — o site deve preferir o banco.
 */

/** Fallback se o admin ainda não salvou nada (evite depender disto em produção) */
export const WHATSAPP_DISPLAY = '';
export const WHATSAPP_E164 = '';
export const WHATSAPP_HREF = '';

export type PublicContact = {
  whatsappDisplay: string;
  whatsappE164: string;
  whatsappHref: string;
  showWhatsApp: boolean;
  contactEmail: string;
  instagramUrl: string;
  contactNote: string;
};

export function digitsOnly(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '');
}

export function waHrefFromE164(e164: string | null | undefined): string {
  const d = digitsOnly(e164);
  return d ? `https://wa.me/${d}` : '';
}

export function waMessageHref(e164: string, text?: string): string {
  const base = waHrefFromE164(e164);
  if (!base) return '';
  if (!text?.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
}

/** Monta contato a partir de chaves Setting (API pública / admin) */
export function publicContactFromRaw(
  raw: Record<string, string | undefined | null>
): PublicContact {
  const e164 = digitsOnly(raw.whatsapp_e164 || raw.WHATSAPP_E164 || '');
  const display = (raw.whatsapp_display || raw.WHATSAPP_DISPLAY || '').trim();
  const showRaw = String(raw.show_whatsapp ?? '1').toLowerCase();
  const showWhatsApp =
    !['0', 'false', 'off', 'no'].includes(showRaw) && Boolean(e164 || display);

  return {
    whatsappDisplay: display || (e164 ? formatBrPhoneHint(e164) : ''),
    whatsappE164: e164,
    whatsappHref: waHrefFromE164(e164),
    showWhatsApp,
    contactEmail: (
      raw.contact_email ||
      raw.CONTACT_EMAIL ||
      raw.from_email ||
      ''
    ).trim(),
    instagramUrl: (raw.instagram_url || raw.INSTAGRAM_URL || '').trim(),
    contactNote: (raw.contact_note || '').trim(),
  };
}

/** Formata 5582… para hint visual se display vazio */
function formatBrPhoneHint(e164: string): string {
  const d = digitsOnly(e164);
  if (d.length === 13 && d.startsWith('55')) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9) {
      return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return d;
}

/**
 * Substitui tokens no HTML/texto do rodapé pelos dados de Contato do admin.
 * {whatsapp} {whatsapp_link} {email} {instagram}
 */
export function injectContactTokens(
  html: string,
  contact: {
    whatsappDisplay?: string;
    whatsappHref?: string;
    contactEmail?: string;
    instagramUrl?: string;
  }
): string {
  return (html || '')
    .replace(/\{whatsapp\}/gi, contact.whatsappDisplay || '')
    .replace(/\{whatsapp_link\}/gi, contact.whatsappHref || '')
    .replace(/\{email\}/gi, contact.contactEmail || '')
    .replace(/\{instagram\}/gi, contact.instagramUrl || '');
}

/** @deprecated use waMessageHref com e164 do settings */
export const WHATSAPP_MESSAGE_HREF = (text?: string) => {
  if (!WHATSAPP_E164) return '';
  return waMessageHref(WHATSAPP_E164, text);
};
