import { prisma } from '@/lib/prisma';
import {
  calculatePromoDiscount,
  normalizePromoCode,
  type PromoCalcResult,
  type PromoCodeRules,
} from '@/lib/promo-validate';

export type ApplyPromoInput = {
  code?: string | null;
  eventId: string;
  unitPricesCents: number[];
};

export type ApplyPromoSuccess = {
  applied: string;
  /** null = cupom legado via Setting (sem tabela PromoCode) */
  promoCodeId: string | null;
  discountCents: number;
  subtotalCents: number;
  totalCents: number;
  ticketQty: number;
};

export type ApplyPromoFailure = {
  applied: null;
  promoCodeId: null;
  discountCents: 0;
  subtotalCents: number;
  totalCents: number;
  ticketQty: number;
  error?: string;
};

export type ApplyPromoResult = ApplyPromoSuccess | ApplyPromoFailure;

function toRules(row: {
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
  startsAt: Date | null;
  endsAt: Date | null;
}): PromoCodeRules {
  return {
    code: row.code,
    active: row.active,
    eventId: row.eventId,
    discountType: row.discountType,
    discountValue: row.discountValue,
    minTickets: row.minTickets,
    maxTicketsDiscounted: row.maxTicketsDiscounted,
    minSubtotalCents: row.minSubtotalCents,
    maxUses: row.maxUses,
    maxUsesPerEmail: row.maxUsesPerEmail,
    reservedUses: row.reservedUses,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

/**
 * Valida cupom sem reservar (preview).
 */
export async function validatePromoCode(
  input: ApplyPromoInput
): Promise<PromoCalcResult & { promoCodeId?: string }> {
  const code = normalizePromoCode(input.code);
  const subtotal = input.unitPricesCents.reduce((s, p) => s + p, 0);
  const ticketQty = input.unitPricesCents.length;

  if (!code) {
    return {
      ok: false,
      error: 'Informe um cupom',
      code: 'invalid',
    };
  }

  let row;
  try {
    row = await prisma.promoCode.findUnique({ where: { code } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('does not exist') || msg.includes('P2021') || msg.includes('PromoCode')) {
      return {
        ok: false,
        error: 'Cupons ainda não estão configurados no banco (rode o SQL de PromoCode)',
        code: 'bad_config',
      };
    }
    throw e;
  }

  if (!row) {
    return { ok: false, error: 'Cupom inválido', code: 'invalid' };
  }

  const calc = calculatePromoDiscount(toRules(row), {
    eventId: input.eventId,
    unitPricesCents: input.unitPricesCents,
  });

  if (!calc.ok) return calc;
  return { ...calc, promoCodeId: row.id };
}

/**
 * Aplica cupom no create do pedido: calcula + reserva uso (transação).
 * Se code vazio: retorna sem desconto (não é erro).
 * Se code inválido e informado: retorna error (caller decide bloquear).
 */
export async function applyAndReservePromo(
  input: ApplyPromoInput
): Promise<ApplyPromoResult> {
  const subtotalCents = input.unitPricesCents.reduce((s, p) => s + p, 0);
  const ticketQty = input.unitPricesCents.length;
  const code = normalizePromoCode(input.code);

  if (!code) {
    return {
      applied: null,
      promoCodeId: null,
      discountCents: 0,
      subtotalCents,
      totalCents: subtotalCents,
      ticketQty,
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.promoCode.findUnique({ where: { code } });
      if (!row) {
        return {
          applied: null,
          promoCodeId: null,
          discountCents: 0,
          subtotalCents,
          totalCents: subtotalCents,
          ticketQty,
          error: 'Cupom inválido',
        } satisfies ApplyPromoFailure;
      }

      const calc = calculatePromoDiscount(toRules(row), {
        eventId: input.eventId,
        unitPricesCents: input.unitPricesCents,
      });

      if (!calc.ok) {
        return {
          applied: null,
          promoCodeId: null,
          discountCents: 0,
          subtotalCents,
          totalCents: subtotalCents,
          ticketQty,
          error: calc.error,
        } satisfies ApplyPromoFailure;
      }

      // Reserva atômica se há maxUses
      if (row.maxUses != null) {
        const updated = await tx.promoCode.updateMany({
          where: {
            id: row.id,
            reservedUses: { lt: row.maxUses },
          },
          data: { reservedUses: { increment: 1 } },
        });
        if (updated.count === 0) {
          return {
            applied: null,
            promoCodeId: null,
            discountCents: 0,
            subtotalCents,
            totalCents: subtotalCents,
            ticketQty,
            error: 'Cupom esgotado',
          } satisfies ApplyPromoFailure;
        }
      } else {
        await tx.promoCode.update({
          where: { id: row.id },
          data: { reservedUses: { increment: 1 } },
        });
      }

      return {
        applied: calc.code,
        promoCodeId: row.id,
        discountCents: calc.discountCents,
        subtotalCents: calc.subtotalCents,
        totalCents: calc.totalCents,
        ticketQty: calc.ticketQty,
      } satisfies ApplyPromoSuccess;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('does not exist') || msg.includes('P2021') || msg.includes('PromoCode')) {
      // Fallback legado Settings (1 cupom %)
      return applyLegacyPromo(subtotalCents, ticketQty, code);
    }
    throw e;
  }
}

/** Fallback: Setting promo_code / promo_percent / promo_active */
async function applyLegacyPromo(
  subtotalCents: number,
  ticketQty: number,
  code: string
): Promise<ApplyPromoResult> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['promo_code', 'promo_percent', 'promo_active'] } },
    });
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.key] = r.value;
    });
    const expected = (map.promo_code || '').trim().toUpperCase();
    const percent = parseFloat(map.promo_percent || '0') || 0;
    const active = map.promo_active === '1' || map.promo_active === 'true';
    if (!active || !expected || code !== expected || percent <= 0) {
      return {
        applied: null,
        promoCodeId: null,
        discountCents: 0,
        subtotalCents,
        totalCents: subtotalCents,
        ticketQty,
        error: 'Cupom inválido',
      };
    }
    const discountCents = Math.min(
      subtotalCents,
      Math.round((subtotalCents * Math.min(100, percent)) / 100)
    );
    return {
      applied: expected,
      promoCodeId: null,
      discountCents,
      subtotalCents,
      totalCents: Math.max(0, subtotalCents - discountCents),
      ticketQty,
    };
  } catch {
    return {
      applied: null,
      promoCodeId: null,
      discountCents: 0,
      subtotalCents,
      totalCents: subtotalCents,
      ticketQty,
      error: 'Cupom indisponível',
    } satisfies ApplyPromoFailure;
  }
}

/**
 * Cria PromoRedemption reserved após order.create (fora da mesma tx se order já existe).
 */
export async function createPromoRedemption(params: {
  promoCodeId: string;
  orderId: string;
  discountCents: number;
  ticketQty: number;
  buyerEmail?: string | null;
}): Promise<void> {
  try {
    await prisma.promoRedemption.create({
      data: {
        promoCodeId: params.promoCodeId,
        orderId: params.orderId,
        discountCents: params.discountCents,
        ticketQty: params.ticketQty,
        buyerEmail: params.buyerEmail?.trim().toLowerCase() || null,
        status: 'reserved',
      },
    });
  } catch (e) {
    console.error('[promo] create redemption failed', e);
  }
}

/**
 * Libera reserva quando pedido pending é cancelado/expira.
 * Idempotente.
 */
export async function releasePromoReservation(orderId: string): Promise<void> {
  try {
    const red = await prisma.promoRedemption.findUnique({
      where: { orderId },
    });
    if (!red || red.status === 'released') return;
    if (red.status === 'applied') {
      // Estorno de pedido pago: devolve redeemed + reserved
      await prisma.$transaction([
        prisma.promoRedemption.update({
          where: { id: red.id },
          data: { status: 'released', releasedAt: new Date() },
        }),
        prisma.promoCode.update({
          where: { id: red.promoCodeId },
          data: {
            reservedUses: { decrement: 1 },
            redeemedUses: { decrement: 1 },
          },
        }),
      ]);
      // clamp negatives
      await clampPromoCounters(red.promoCodeId);
      return;
    }

    await prisma.$transaction([
      prisma.promoRedemption.update({
        where: { id: red.id },
        data: { status: 'released', releasedAt: new Date() },
      }),
      prisma.promoCode.update({
        where: { id: red.promoCodeId },
        data: { reservedUses: { decrement: 1 } },
      }),
    ]);
    await clampPromoCounters(red.promoCodeId);
  } catch (e) {
    console.error('[promo] release reservation failed', orderId, e);
  }
}

async function clampPromoCounters(promoCodeId: string) {
  try {
    await prisma.$executeRaw`
      UPDATE PromoCode
      SET reservedUses = GREATEST(0, reservedUses),
          redeemedUses = GREATEST(0, redeemedUses)
      WHERE id = ${promoCodeId}
    `;
  } catch {
    const row = await prisma.promoCode.findUnique({ where: { id: promoCodeId } });
    if (!row) return;
    const data: { reservedUses?: number; redeemedUses?: number } = {};
    if (row.reservedUses < 0) data.reservedUses = 0;
    if (row.redeemedUses < 0) data.redeemedUses = 0;
    if (Object.keys(data).length) {
      await prisma.promoCode.update({ where: { id: promoCodeId }, data });
    }
  }
}

/**
 * Marca redemption como applied no pagamento + incrementa redeemedUses.
 * Também grava buyerEmail se ainda não tinha.
 */
export async function markPromoApplied(
  orderId: string,
  buyerEmail?: string | null
): Promise<void> {
  try {
    const red = await prisma.promoRedemption.findUnique({ where: { orderId } });
    if (!red) return;
    if (red.status === 'applied') {
      if (buyerEmail && !red.buyerEmail) {
        await prisma.promoRedemption.update({
          where: { id: red.id },
          data: { buyerEmail: buyerEmail.trim().toLowerCase() },
        });
      }
      return;
    }
    if (red.status === 'released') return;

    await prisma.$transaction([
      prisma.promoRedemption.update({
        where: { id: red.id },
        data: {
          status: 'applied',
          appliedAt: new Date(),
          buyerEmail: buyerEmail?.trim().toLowerCase() || red.buyerEmail,
        },
      }),
      prisma.promoCode.update({
        where: { id: red.promoCodeId },
        data: { redeemedUses: { increment: 1 } },
      }),
    ]);
  } catch (e) {
    console.error('[promo] mark applied failed', orderId, e);
  }
}

/**
 * No pay: se maxUsesPerEmail, bloqueia se e-mail já usou o cupom.
 */
export async function assertPromoEmailAllowed(
  orderId: string,
  buyerEmail: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = buyerEmail.trim().toLowerCase();
  if (!email) return { ok: true };

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        promoCodeId: true,
        promoCode: {
          select: { id: true, maxUsesPerEmail: true, code: true },
        },
      },
    });
    if (!order?.promoCodeId || !order.promoCode?.maxUsesPerEmail) {
      return { ok: true };
    }

    const limit = order.promoCode.maxUsesPerEmail;
    const count = await prisma.promoRedemption.count({
      where: {
        promoCodeId: order.promoCodeId,
        buyerEmail: email,
        status: { in: ['reserved', 'applied'] },
        orderId: { not: orderId },
      },
    });

    if (count >= limit) {
      return {
        ok: false,
        error:
          limit === 1
            ? `O cupom ${order.promoCode.code} já foi usado com este e-mail`
            : `Limite de ${limit} usos do cupom ${order.promoCode.code} por e-mail atingido`,
      };
    }

    // atualiza e-mail na redemption atual
    await prisma.promoRedemption.updateMany({
      where: { orderId, status: 'reserved' },
      data: { buyerEmail: email },
    });

    return { ok: true };
  } catch (e) {
    console.error('[promo] email check failed', e);
    return { ok: true }; // não bloqueia se tabela ausente
  }
}

/**
 * Migra Setting legado para PromoCode se ainda não existir.
 */
export async function migrateLegacyPromoSetting(): Promise<{ migrated: boolean; code?: string }> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['promo_code', 'promo_percent', 'promo_active'] } },
    });
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.key] = r.value;
    });
    const code = normalizePromoCode(map.promo_code);
    const percent = parseFloat(map.promo_percent || '0') || 0;
    const active = map.promo_active === '1' || map.promo_active === 'true';
    if (!code || percent <= 0) return { migrated: false };

    const existing = await prisma.promoCode.findUnique({ where: { code } });
    if (existing) return { migrated: false, code };

    await prisma.promoCode.create({
      data: {
        code,
        name: 'Migrado do Setting legado',
        active,
        discountType: 'PERCENT',
        discountValue: Math.min(100, Math.max(1, Math.round(percent))),
        maxUses: null,
      },
    });
    return { migrated: true, code };
  } catch (e) {
    console.error('[promo] legacy migrate failed', e);
    return { migrated: false };
  }
}

/** @deprecated prefer applyAndReservePromo — mantido para imports antigos */
export async function applyPromoCode(
  totalCents: number,
  promoCode?: string | null
): Promise<{ totalCents: number; discountCents: number; applied: string | null }> {
  const code = normalizePromoCode(promoCode);
  if (!code || totalCents <= 0) {
    return { totalCents, discountCents: 0, applied: null };
  }
  // Simula 1 ingresso com o total (legado %)
  const r = await applyAndReservePromo({
    code,
    eventId: '', // wrong_event only if promo has eventId
    unitPricesCents: [totalCents],
  });
  // Não deveria reservar no path legado sem order — só usado se alguém ainda chamar
  // Reverter reserva se houve promoCodeId sem order
  if (r.promoCodeId && r.applied) {
    try {
      await prisma.promoCode.update({
        where: { id: r.promoCodeId },
        data: { reservedUses: { decrement: 1 } },
      });
      await clampPromoCounters(r.promoCodeId);
    } catch {
      /* ignore */
    }
  }
  return {
    totalCents: r.totalCents,
    discountCents: r.discountCents,
    applied: r.applied,
  };
}
