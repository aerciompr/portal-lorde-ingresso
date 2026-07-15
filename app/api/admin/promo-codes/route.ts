import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import { normalizePromoCode } from '@/lib/promo-validate';
import { migrateLegacyPromoSetting } from '@/lib/promo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISCOUNT_TYPES = new Set(['PERCENT', 'FIXED_ORDER', 'FIXED_PER_TICKET']);

function parseOptionalInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseOptionalDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function serialize(row: {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
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
  redeemedUses: number;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  event?: { id: string; title: string; slug: string } | null;
  _count?: { redemptions: number };
}) {
  return {
    ...row,
    event: row.event || null,
    redemptionsCount: row._count?.redemptions ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // One-shot: migra Setting legado se ainda não houver PromoCode
    await migrateLegacyPromoSetting();

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const active = searchParams.get('active'); // 1 | 0 | all
    const eventId = searchParams.get('eventId') || '';

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { code: { contains: q } },
        { name: { contains: q } },
      ];
    }
    if (active === '1') where.active = true;
    if (active === '0') where.active = false;
    if (eventId === 'global') where.eventId = null;
    else if (eventId) where.eventId = eventId;

    const list = await prisma.promoCode.findMany({
      where,
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: {
        event: { select: { id: true, title: true, slug: true } },
        _count: { select: { redemptions: true } },
      },
    });

    return NextResponse.json({ promoCodes: list.map(serialize) });
  } catch (e) {
    console.error('[admin/promo-codes GET]', e);
    const msg = e instanceof Error ? e.message : '';
    return NextResponse.json(
      {
        error:
          msg.includes('PromoCode') || msg.includes('does not exist') || msg.includes('P2021')
            ? 'Tabela PromoCode ausente. Rode scripts/sql-promo-codes.sql no MySQL ou prisma db push.'
            : msg || 'Erro ao listar cupons',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const code = normalizePromoCode(body.code);
    if (!code || code.length < 2) {
      return NextResponse.json({ error: 'Código inválido (mín. 2 caracteres)' }, { status: 400 });
    }
    if (!DISCOUNT_TYPES.has(String(body.discountType))) {
      return NextResponse.json(
        { error: 'Tipo de desconto inválido (PERCENT, FIXED_ORDER, FIXED_PER_TICKET)' },
        { status: 400 }
      );
    }

    let discountValue = parseInt(String(body.discountValue), 10);
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      return NextResponse.json({ error: 'Valor do desconto inválido' }, { status: 400 });
    }
    if (body.discountType === 'PERCENT') {
      if (discountValue < 1 || discountValue > 100) {
        return NextResponse.json({ error: 'Percentual deve ser entre 1 e 100' }, { status: 400 });
      }
    }

    const eventId =
      body.eventId && String(body.eventId).trim() ? String(body.eventId).trim() : null;
    if (eventId) {
      const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
      if (!ev) return NextResponse.json({ error: 'Evento não encontrado' }, { status: 400 });
    }

    const created = await prisma.promoCode.create({
      data: {
        code,
        name: body.name ? String(body.name).slice(0, 255) : null,
        description: body.description ? String(body.description) : null,
        active: body.active !== false && body.active !== '0',
        eventId,
        discountType: String(body.discountType),
        discountValue,
        minTickets: parseOptionalInt(body.minTickets),
        maxTicketsDiscounted: parseOptionalInt(body.maxTicketsDiscounted),
        minSubtotalCents: parseOptionalInt(body.minSubtotalCents),
        maxUses: parseOptionalInt(body.maxUses),
        maxUsesPerEmail: parseOptionalInt(body.maxUsesPerEmail),
        startsAt: parseOptionalDate(body.startsAt),
        endsAt: parseOptionalDate(body.endsAt),
      },
      include: {
        event: { select: { id: true, title: true, slug: true } },
      },
    });

    return NextResponse.json({ promoCode: serialize(created) }, { status: 201 });
  } catch (e) {
    console.error('[admin/promo-codes POST]', e);
    const err = e as { code?: string; message?: string };
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe um cupom com este código' }, { status: 409 });
    }
    return NextResponse.json(
      {
        error:
          err?.message?.includes('PromoCode') || err?.message?.includes('P2021')
            ? 'Tabela PromoCode ausente. Rode scripts/sql-promo-codes.sql no MySQL.'
            : err?.message || 'Erro ao criar cupom',
      },
      { status: 500 }
    );
  }
}
