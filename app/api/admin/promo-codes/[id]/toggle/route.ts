import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const existing = await prisma.promoCode.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Cupom não encontrado' }, { status: 404 });
    const updated = await prisma.promoCode.update({
      where: { id },
      data: { active: !existing.active },
      include: {
        event: { select: { id: true, title: true, slug: true } },
      },
    });
    return NextResponse.json({ promoCode: updated });
  } catch (e) {
    console.error('[admin/promo-codes toggle]', e);
    return NextResponse.json({ error: 'Erro ao alternar cupom' }, { status: 500 });
  }
}
