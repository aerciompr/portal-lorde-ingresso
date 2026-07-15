import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import { normalizePromoCode } from '@/lib/promo-validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISCOUNT_TYPES = new Set(['PERCENT', 'FIXED_ORDER', 'FIXED_PER_TICKET']);

function parseOptionalInt(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseOptionalDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const row = await prisma.promoCode.findUnique({
      where: { id },
      include: {
        event: { select: { id: true, title: true, slug: true } },
        redemptions: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            orderId: true,
            buyerEmail: true,
            discountCents: true,
            ticketQty: true,
            status: true,
            createdAt: true,
            appliedAt: true,
            releasedAt: true,
          },
        },
      },
    });
    if (!row) return NextResponse.json({ error: 'Cupom não encontrado' }, { status: 404 });
    return NextResponse.json({ promoCode: row });
  } catch (e) {
    console.error('[admin/promo-codes GET id]', e);
    return NextResponse.json({ error: 'Erro ao carregar cupom' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const existing = await prisma.promoCode.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Cupom não encontrado' }, { status: 404 });

    const data: Record<string, unknown> = {};

    if (body.code !== undefined) {
      const code = normalizePromoCode(body.code);
      if (!code || code.length < 2) {
        return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
      }
      data.code = code;
    }
    if (body.name !== undefined) data.name = body.name ? String(body.name).slice(0, 255) : null;
    if (body.description !== undefined)
      data.description = body.description ? String(body.description) : null;
    if (body.active !== undefined) data.active = Boolean(body.active);

    if (body.discountType !== undefined) {
      if (!DISCOUNT_TYPES.has(String(body.discountType))) {
        return NextResponse.json({ error: 'Tipo de desconto inválido' }, { status: 400 });
      }
      data.discountType = String(body.discountType);
    }
    if (body.discountValue !== undefined) {
      let discountValue = parseInt(String(body.discountValue), 10);
      if (!Number.isFinite(discountValue) || discountValue < 0) {
        return NextResponse.json({ error: 'Valor do desconto inválido' }, { status: 400 });
      }
      const dtype = String(body.discountType || existing.discountType);
      if (dtype === 'PERCENT' && (discountValue < 1 || discountValue > 100)) {
        return NextResponse.json({ error: 'Percentual deve ser entre 1 e 100' }, { status: 400 });
      }
      data.discountValue = discountValue;
    }

    if (body.eventId !== undefined) {
      const eventId =
        body.eventId && String(body.eventId).trim() ? String(body.eventId).trim() : null;
      if (eventId) {
        const ev = await prisma.event.findUnique({
          where: { id: eventId },
          select: { id: true },
        });
        if (!ev) return NextResponse.json({ error: 'Evento não encontrado' }, { status: 400 });
      }
      data.eventId = eventId;
    }

    const minTickets = parseOptionalInt(body.minTickets);
    if (minTickets !== undefined) data.minTickets = minTickets;
    const maxTicketsDiscounted = parseOptionalInt(body.maxTicketsDiscounted);
    if (maxTicketsDiscounted !== undefined) data.maxTicketsDiscounted = maxTicketsDiscounted;
    const minSubtotalCents = parseOptionalInt(body.minSubtotalCents);
    if (minSubtotalCents !== undefined) data.minSubtotalCents = minSubtotalCents;
    const maxUses = parseOptionalInt(body.maxUses);
    if (maxUses !== undefined) data.maxUses = maxUses;
    const maxUsesPerEmail = parseOptionalInt(body.maxUsesPerEmail);
    if (maxUsesPerEmail !== undefined) data.maxUsesPerEmail = maxUsesPerEmail;

    const startsAt = parseOptionalDate(body.startsAt);
    if (startsAt !== undefined) data.startsAt = startsAt;
    const endsAt = parseOptionalDate(body.endsAt);
    if (endsAt !== undefined) data.endsAt = endsAt;

    const updated = await prisma.promoCode.update({
      where: { id },
      data,
      include: {
        event: { select: { id: true, title: true, slug: true } },
      },
    });

    return NextResponse.json({ promoCode: updated });
  } catch (e) {
    console.error('[admin/promo-codes PATCH]', e);
    const err = e as { code?: string; message?: string };
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe um cupom com este código' }, { status: 409 });
    }
    return NextResponse.json({ error: err?.message || 'Erro ao atualizar' }, { status: 500 });
  }
}

/** DELETE — desativa (soft). Não apaga histórico. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const updated = await prisma.promoCode.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ promoCode: updated, deactivated: true });
  } catch (e) {
    console.error('[admin/promo-codes DELETE]', e);
    return NextResponse.json({ error: 'Erro ao desativar cupom' }, { status: 500 });
  }
}
