import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';

/**
 * GET — status das crons (sem revelar o secret).
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const secret = (
    process.env.CRON_SECRET ||
    process.env.ADMIN_CRON_SECRET ||
    ''
  ).trim();

  let lastRunAt: string | null = null;
  let lastRunSource: string | null = null;
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['cron_last_run_at', 'cron_last_run_source'] } },
    });
    for (const r of rows) {
      if (r.key === 'cron_last_run_at') lastRunAt = r.value;
      if (r.key === 'cron_last_run_source') lastRunSource = r.value;
    }
  } catch {
    /* ignore */
  }

  const s = await getAppSettings();
  const pendingCount = await prisma.order.count({ where: { status: 'pending' } });
  const pendingOld = await prisma.order.count({
    where: {
      status: 'pending',
      createdAt: {
        lt: new Date(Date.now() - (s.pendingOrderTtlMinutes || 30) * 60 * 1000),
      },
    },
  });

  const appUrl = (
    s.publicUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://portal.lordenelson.com.br'
  ).replace(/\/$/, '');

  return NextResponse.json({
    cronSecretConfigured: Boolean(secret),
    lastRunAt,
    lastRunSource,
    pendingOrderTtlMinutes: s.pendingOrderTtlMinutes || 30,
    pendingCount,
    pendingOlderThanTtl: pendingOld,
    endpoints: {
      sync: `${appUrl}/api/cron/sync-payments`,
      cleanup: `${appUrl}/api/cron/cleanup-pending`,
    },
    /** URL de teste (substitua SEU_SECRET) — só documenta, não inclui o secret real */
    testCurlExample:
      'curl -sS -H "Authorization: Bearer SEU_CRON_SECRET" "https://portal.lordenelson.com.br/api/cron/cleanup-pending"',
    note:
      'Scripts na pasta /scripts NÃO disparam cron sozinhos. É preciso HTTP agendado (cron-job.org / EasyPanel) OU botão "Rodar crons agora" no admin.',
  });
}
