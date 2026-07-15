/**
 * Motor puro de validação/cálculo de cupom (sem I/O).
 * discountType: PERCENT | FIXED_ORDER | FIXED_PER_TICKET
 */

export type DiscountType = 'PERCENT' | 'FIXED_ORDER' | 'FIXED_PER_TICKET';

export type PromoCodeRules = {
  code: string;
  active: boolean;
  eventId: string | null;
  discountType: string;
  discountValue: number;
  minTickets: number | null;
  maxTicketsDiscounted: number | null;
  minSubtotalCents: number | null;
  maxUses: number | null;
  maxUsesPerEmail: number | null;
  reservedUses: number;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
};

export type PromoCartInput = {
  eventId: string;
  /** Preço unitário de cada ingresso (um item por ingresso) */
  unitPricesCents: number[];
  /** Agora (testável) */
  now?: Date;
  /** Se true, ignora limite maxUses (preview sem reserva) */
  skipUseLimit?: boolean;
};

export type PromoCalcOk = {
  ok: true;
  code: string;
  discountType: DiscountType;
  discountCents: number;
  subtotalCents: number;
  totalCents: number;
  ticketQty: number;
  ticketsDiscounted: number;
};

export type PromoCalcErr = {
  ok: false;
  error: string;
  code?: 'invalid' | 'inactive' | 'expired' | 'not_started' | 'wrong_event' | 'min_tickets' | 'min_subtotal' | 'exhausted' | 'bad_config';
};

export type PromoCalcResult = PromoCalcOk | PromoCalcErr;

export function normalizePromoCode(raw: string | null | undefined): string {
  return (raw || '').trim().toUpperCase();
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asDiscountType(t: string): DiscountType | null {
  if (t === 'PERCENT' || t === 'FIXED_ORDER' || t === 'FIXED_PER_TICKET') return t;
  return null;
}

/**
 * Calcula desconto sem checar e-mail (isso fica na camada de serviço no pay).
 */
export function calculatePromoDiscount(
  promo: PromoCodeRules,
  cart: PromoCartInput
): PromoCalcResult {
  const code = normalizePromoCode(promo.code);
  if (!code) {
    return { ok: false, error: 'Cupom inválido', code: 'invalid' };
  }
  if (!promo.active) {
    return { ok: false, error: 'Cupom inativo', code: 'inactive' };
  }

  const now = cart.now || new Date();
  const starts = toDate(promo.startsAt);
  const ends = toDate(promo.endsAt);
  if (starts && now < starts) {
    return { ok: false, error: 'Cupom ainda não está válido', code: 'not_started' };
  }
  if (ends && now > ends) {
    return { ok: false, error: 'Cupom expirado', code: 'expired' };
  }

  if (promo.eventId && promo.eventId !== cart.eventId) {
    return { ok: false, error: 'Cupom não vale para este evento', code: 'wrong_event' };
  }

  const unitPrices = (cart.unitPricesCents || []).filter((p) => Number.isFinite(p) && p >= 0);
  const ticketQty = unitPrices.length;
  if (ticketQty < 1) {
    return { ok: false, error: 'Nenhum ingresso no pedido', code: 'invalid' };
  }

  if (promo.minTickets != null && ticketQty < promo.minTickets) {
    return {
      ok: false,
      error: `Mínimo de ${promo.minTickets} ingresso(s) para este cupom`,
      code: 'min_tickets',
    };
  }

  const subtotalCents = unitPrices.reduce((s, p) => s + p, 0);
  if (promo.minSubtotalCents != null && subtotalCents < promo.minSubtotalCents) {
    const reais = (promo.minSubtotalCents / 100).toFixed(2).replace('.', ',');
    return {
      ok: false,
      error: `Valor mínimo de R$ ${reais} para este cupom`,
      code: 'min_subtotal',
    };
  }

  if (!cart.skipUseLimit && promo.maxUses != null && promo.maxUses >= 0) {
    if (promo.reservedUses >= promo.maxUses) {
      return { ok: false, error: 'Cupom esgotado', code: 'exhausted' };
    }
  }

  const dtype = asDiscountType(promo.discountType);
  if (!dtype || !Number.isFinite(promo.discountValue) || promo.discountValue < 0) {
    return { ok: false, error: 'Cupom mal configurado', code: 'bad_config' };
  }

  const maxDisc =
    promo.maxTicketsDiscounted != null && promo.maxTicketsDiscounted > 0
      ? Math.min(ticketQty, promo.maxTicketsDiscounted)
      : ticketQty;

  // Ingressos elegíveis: mais caros primeiro (melhor para o cliente em % / free)
  const sorted = [...unitPrices].sort((a, b) => b - a);
  const eligible = sorted.slice(0, maxDisc);
  const eligibleSubtotal = eligible.reduce((s, p) => s + p, 0);

  let discountCents = 0;

  if (dtype === 'PERCENT') {
    const pct = Math.min(100, Math.max(0, promo.discountValue));
    discountCents = Math.round((eligibleSubtotal * pct) / 100);
  } else if (dtype === 'FIXED_ORDER') {
    // Valor fixo no pedido, limitado ao subtotal (e, se maxTickets, ao subtotal elegível)
    const cap = promo.maxTicketsDiscounted != null ? eligibleSubtotal : subtotalCents;
    discountCents = Math.min(promo.discountValue, cap);
  } else {
    // FIXED_PER_TICKET
    discountCents = Math.min(promo.discountValue * maxDisc, subtotalCents);
  }

  discountCents = Math.max(0, Math.min(subtotalCents, Math.floor(discountCents)));
  const totalCents = Math.max(0, subtotalCents - discountCents);

  return {
    ok: true,
    code,
    discountType: dtype,
    discountCents,
    subtotalCents,
    totalCents,
    ticketQty,
    ticketsDiscounted: maxDisc,
  };
}

export function describePromoRules(promo: {
  discountType: string;
  discountValue: number;
  maxTicketsDiscounted?: number | null;
  maxUses?: number | null;
  maxUsesPerEmail?: number | null;
  eventTitle?: string | null;
}): string {
  let disc = '';
  if (promo.discountType === 'PERCENT') disc = `${promo.discountValue}%`;
  else if (promo.discountType === 'FIXED_ORDER')
    disc = `R$ ${(promo.discountValue / 100).toFixed(2).replace('.', ',')}`;
  else if (promo.discountType === 'FIXED_PER_TICKET')
    disc = `R$ ${(promo.discountValue / 100).toFixed(2).replace('.', ',')} por ingresso`;
  else disc = promo.discountType;

  const parts = [disc];
  if (promo.maxTicketsDiscounted)
    parts.push(`nos primeiros ${promo.maxTicketsDiscounted} ingresso(s)`);
  if (promo.eventTitle) parts.push(`em ${promo.eventTitle}`);
  else parts.push('em todos os eventos');
  if (promo.maxUses === 1) parts.push('uso único');
  else if (promo.maxUses != null) parts.push(`máx. ${promo.maxUses} usos`);
  if (promo.maxUsesPerEmail === 1) parts.push('1x por e-mail');
  else if (promo.maxUsesPerEmail != null)
    parts.push(`${promo.maxUsesPerEmail}x por e-mail`);
  return parts.join(' · ');
}
