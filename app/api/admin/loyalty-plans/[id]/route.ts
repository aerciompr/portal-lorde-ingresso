import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseOptionalInt(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const row = await prisma.loyaltyPlan.findUnique({
      where: { id },
      include: {
        memberships: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            cardCode: true,
            buyerName: true,
            buyerEmail: true,
            status: true,
            entriesUsedInPeriod: true,
            currentPeriodEnd: true,
            createdAt: true,
          },
        },
        _count: { select: { memberships: true } },
      },
    });
    if (!row) return NextResponse.json({ error: 'Pacote não encontrado' }, { status: 404 });
    return NextResponse.json({ plan: row });
  } catch (e) {
    console.error('[admin/loyalty-plans GET id]', e);
    return NextResponse.json({ error: 'Erro ao carregar pacote' }, { status: 500 });
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
    const existing = await prisma.loyaltyPlan.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Pacote não encontrado' }, { status: 404 });

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) return NextResponse.json({ error: 'Nome não pode ficar vazio' }, { status: 400 });
      data.name = name.slice(0, 255);
    }
    if (body.description !== undefined) {
      data.description = body.description ? String(body.description) : null;
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.stripePriceId !== undefined) {
      data.stripePriceId = body.stripePriceId
        ? String(body.stripePriceId).trim().slice(0, 191)
        : null;
    }

    const priceCents = parseOptionalInt(body.priceCents);
    if (priceCents !== undefined) {
      if (priceCents === null || priceCents < 0) {
        return NextResponse.json({ error: 'Mensalidade inválida' }, { status: 400 });
      }
      data.priceCents = priceCents;
    }

    const freeEntriesPerCycle = parseOptionalInt(body.freeEntriesPerCycle);
    if (freeEntriesPerCycle !== undefined) {
      if (freeEntriesPerCycle === null || freeEntriesPerCycle < 0) {
        return NextResponse.json(
          { error: 'Entradas grátis por ciclo não pode ser negativo' },
          { status: 400 }
        );
      }
      data.freeEntriesPerCycle = freeEntriesPerCycle;
    }

    const checkinsPerEntry = parseOptionalInt(body.checkinsPerEntry);
    if (checkinsPerEntry !== undefined) {
      if (checkinsPerEntry !== 1 && checkinsPerEntry !== 2) {
        return NextResponse.json({ error: 'Check-ins por entrada deve ser 1 ou 2' }, { status: 400 });
      }
      data.checkinsPerEntry = checkinsPerEntry;
    }

    const overageDiscountPercent = parseOptionalInt(body.overageDiscountPercent);
    if (overageDiscountPercent !== undefined) {
      if (overageDiscountPercent === null || overageDiscountPercent < 0 || overageDiscountPercent > 100) {
        return NextResponse.json(
          { error: 'Desconto no excedente deve ser entre 0 e 100' },
          { status: 400 }
        );
      }
      data.overageDiscountPercent = overageDiscountPercent;
    }

    const updated = await prisma.loyaltyPlan.update({ where: { id }, data });
    return NextResponse.json({ plan: updated });
  } catch (e) {
    console.error('[admin/loyalty-plans PATCH]', e);
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message || 'Erro ao atualizar pacote' }, { status: 500 });
  }
}

/** DELETE — desativa (soft). Não apaga histórico de assinantes/resgates. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const updated = await prisma.loyaltyPlan.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ plan: updated, deactivated: true });
  } catch (e) {
    console.error('[admin/loyalty-plans DELETE]', e);
    return NextResponse.json({ error: 'Erro ao desativar pacote' }, { status: 500 });
  }
}
