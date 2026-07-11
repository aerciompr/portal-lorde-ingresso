/** Contatos públicos do Lorde Nelson (portal) */

/** WhatsApp exibido no site — mesmo do rodapé/e-mail */
export const WHATSAPP_DISPLAY = '(82) 99647-1998';

/** Dígitos E.164 sem + (Brasil 55 + DDD 82 + número) */
export const WHATSAPP_E164 = '5582996471998';

export const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_E164}`;

export const WHATSAPP_MESSAGE_HREF = (text?: string) => {
  const base = WHATSAPP_HREF;
  if (!text?.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
};
