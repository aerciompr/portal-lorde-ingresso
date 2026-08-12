import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import { validateLoyaltyPlanPrices, syncLoyaltyPlanPrices } from '@/lib/loyalty-plan-prices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseOptionalInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function validatePlanFields(body: Record<string, unknown>): { error: string } | null {
  if (body.checkinsPerEntry !== undefined) {
    const c = parseOptionalInt(body.checkinsPerEntry);
    if (c === null || c < 1) {
      return { error: 'Check-ins por entrada deve ser 1 ou mais' };
    }
  }
  if (body.overageDiscountPercent !== undefined) {
    const d = parseOptionalInt(body.overageDiscountPercent);
    if (d === null || d < 0 || d > 100) {
      return { error: 'Desconto no excedente deve ser entre 0 e 100' };
    }
  }
  if (body.freeEntriesPerCycle !== undefined) {
    const f = parseOptionalInt(body.freeEntriesPerCycle);
    if (f === null || f < 0) {
      return { error: 'Entradas grátis por ciclo não pode ser negativo' };
    }
  }
  return null;
}

/**
 * GET /api/admin/loyalty-plans
 * Lista pacotes do clube de fidelidade, com as periodicidades de cada um.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const active = searchParams.get('active'); // 1 | 0 | all

    const where: Record<string, unknown> = {};
    if (active === '1') where.active = true;
    if (active === '0') where.active = false;

    const list = await prisma.loyaltyPlan.findMany({
      where,
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: {
        prices: { orderBy: { createdAt: 'asc' } },
        _count: { select: { memberships: true } },
      },
    });

    return NextResponse.json({ plans: list });
  } catch (e) {
    console.error('[admin/loyalty-plans GET]', e);
    const msg = e instanceof Error ? e.message : '';
    return NextResponse.json(
      {
        error:
          msg.includes('LoyaltyPlan') || msg.includes('P2021')
            ? 'Tabela LoyaltyPlan ausente. Rode prisma db push.'
            : msg || 'Erro ao listar pacotes',
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

    const name = String(body.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Nome do pacote é obrigatório' }, { status: 400 });
    }

    const invalid = validatePlanFields(body);
    if (invalid) return NextResponse.json(invalid, { status: 400 });

    const pricesResult = validateLoyaltyPlanPrices(body.prices);
    if ('error' in pricesResult) {
      return NextResponse.json({ error: pricesResult.error }, { status: 400 });
    }

    const checkinsPerEntry = parseOptionalInt(body.checkinsPerEntry) ?? 1;
    const overageDiscountPercent = parseOptionalInt(body.overageDiscountPercent) ?? 0;
    const freeEntriesPerCycle = parseOptionalInt(body.freeEntriesPerCycle) ?? 1;

    const created = await prisma.loyaltyPlan.create({
      data: {
        name: name.slice(0, 255),
        description: body.description ? String(body.description) : null,
        freeEntriesPerCycle,
        checkinsPerEntry,
        overageDiscountPercent,
        active: body.active !== false && body.active !== '0',
      },
    });

    await syncLoyaltyPlanPrices(created.id, pricesResult.items);

    const withPrices = await prisma.loyaltyPlan.findUnique({
      where: { id: created.id },
      include: { prices: { orderBy: { createdAt: 'asc' } } },
    });

    return NextResponse.json({ plan: withPrices }, { status: 201 });
  } catch (e) {
    console.error('[admin/loyalty-plans POST]', e);
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message || 'Erro ao criar pacote' }, { status: 500 });
  }
}
