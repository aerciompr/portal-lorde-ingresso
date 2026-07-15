import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import {
  listLowStockLotes,
  LOTE_WARN_REMAINING,
  LOTE_EMAIL_REMAINING,
} from '@/lib/lote-stock-alerts';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — lotes ativos com poucas vagas (padrão: ≤5).
 * Inclui e-mail de alerta configurado (sem secrets).
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const items = await listLowStockLotes(LOTE_WARN_REMAINING);
    let alertEmail = '';
    try {
      const row = await prisma.setting.findUnique({
        where: { key: 'lote_alert_email' },
      });
      alertEmail = (row?.value || '').trim();
      if (!alertEmail) {
        const contact = await prisma.setting.findUnique({
          where: { key: 'contact_email' },
        });
        alertEmail = (contact?.value || '').trim();
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      items,
      warnAt: LOTE_WARN_REMAINING,
      emailAt: LOTE_EMAIL_REMAINING,
      alertEmail: alertEmail || null,
      counts: {
        total: items.length,
        critical: items.filter((i) => i.level === 'critical' || i.level === 'soldout').length,
        low: items.filter((i) => i.level === 'low').length,
      },
    });
  } catch (e) {
    console.error('[admin/lotes/low-stock]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao listar lotes' },
      { status: 500 }
    );
  }
}
