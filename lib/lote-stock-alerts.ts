import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';

/** Painel: alerta visual a partir desta quantidade restante */
export const LOTE_WARN_REMAINING = 5;
/** E-mail automático quando restante ≤ este valor */
export const LOTE_EMAIL_REMAINING = 2;

const ALERT_KEY_PREFIX = 'lote_alert_emailed_';

export type LowStockLote = {
  id: string;
  nome: string;
  totalQty: number;
  sold: number;
  remaining: number;
  precoCents: number;
  ativo: boolean;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventDate: string;
  level: 'critical' | 'low' | 'soldout';
  emailAlerted: boolean;
};

function remainingOf(totalQty: number, sold: number) {
  return Math.max(0, totalQty - sold);
}

function levelOf(remaining: number): LowStockLote['level'] {
  if (remaining <= 0) return 'soldout';
  if (remaining <= LOTE_EMAIL_REMAINING) return 'critical';
  return 'low';
}

/**
 * Lotes ativos (ou esgotados ainda “ativos” no sentido de alerta) com poucas vagas.
 * Default: remaining ≤ 5.
 */
export async function listLowStockLotes(
  maxRemaining: number = LOTE_WARN_REMAINING
): Promise<LowStockLote[]> {
  const lotes = await prisma.lote.findMany({
    where: {
      ativo: true,
    },
    include: {
      event: { select: { id: true, title: true, slug: true, date: true } },
    },
    orderBy: [{ sold: 'desc' }],
  });

  const alertKeys = lotes.map((l) => `${ALERT_KEY_PREFIX}${l.id}`);
  const alertRows =
    alertKeys.length > 0
      ? await prisma.setting.findMany({
          where: { key: { in: alertKeys } },
          select: { key: true },
        })
      : [];
  const alerted = new Set(alertRows.map((r) => r.key));

  const out: LowStockLote[] = [];
  for (const l of lotes) {
    const remaining = remainingOf(l.totalQty, l.sold);
    if (remaining > maxRemaining) continue;
    out.push({
      id: l.id,
      nome: l.nome,
      totalQty: l.totalQty,
      sold: l.sold,
      remaining,
      precoCents: l.precoCents,
      ativo: l.ativo,
      eventId: l.event.id,
      eventTitle: l.event.title,
      eventSlug: l.event.slug,
      eventDate: l.event.date.toISOString(),
      level: levelOf(remaining),
      emailAlerted: alerted.has(`${ALERT_KEY_PREFIX}${l.id}`),
    });
  }

  out.sort((a, b) => a.remaining - b.remaining || a.eventTitle.localeCompare(b.eventTitle));
  return out;
}

/** E-mail de alerta de lotes (virada / estoque) — publicável para reutilizar. */
export async function getAlertEmailForLote(): Promise<string> {
  try {
    const rows = await prisma.setting.findMany({
      where: {
        key: { in: ['lote_alert_email', 'contact_email', 'from_email'] },
      },
    });
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.key] = r.value;
    });
    const custom = (map.lote_alert_email || '').trim();
    if (custom.includes('@')) return custom;
    const contact = (map.contact_email || '').trim();
    if (contact.includes('@')) return contact;
    const s = await getAppSettings();
    return (s.contact.contactEmail || s.fromEmail || '').trim();
  } catch {
    return '';
  }
}

async function getAlertEmail(): Promise<string> {
  return getAlertEmailForLote();
}

/**
 * Após mudança de estoque do lote: se restam ≤2 e ainda não avisou, envia e-mail.
 * Se restam >2, limpa flag para poder avisar de novo no futuro.
 */
export async function checkLoteLowStockAlert(loteId: string | null | undefined): Promise<{
  checked: boolean;
  emailed?: boolean;
  remaining?: number;
  error?: string;
}> {
  if (!loteId) return { checked: false };

  try {
    const lote = await prisma.lote.findUnique({
      where: { id: loteId },
      include: {
        event: { select: { title: true, slug: true, date: true } },
      },
    });
    if (!lote) return { checked: false };

    const remaining = remainingOf(lote.totalQty, lote.sold);
    const key = `${ALERT_KEY_PREFIX}${lote.id}`;

    // Voltou a ter folga → permite novo alerta depois
    if (remaining > LOTE_EMAIL_REMAINING) {
      try {
        await prisma.setting.deleteMany({ where: { key } });
      } catch {
        /* ignore */
      }
      return { checked: true, remaining, emailed: false };
    }

    // remaining ≤ 2
    const already = await prisma.setting.findUnique({ where: { key } });
    if (already) {
      return { checked: true, remaining, emailed: false };
    }

    const to = await getAlertEmail();
    if (!to || !to.includes('@')) {
      console.warn('[lote-alert] sem e-mail de alerta configurado (lote_alert_email)');
      return { checked: true, remaining, emailed: false, error: 'sem e-mail' };
    }

    const { sendLoteLowStockAlert } = await import('@/lib/email');
    const mail = await sendLoteLowStockAlert({
      to,
      eventTitle: lote.event.title,
      eventSlug: lote.event.slug,
      loteNome: lote.nome,
      remaining,
      totalQty: lote.totalQty,
      sold: lote.sold,
      eventDate: lote.event.date,
    });

    if (mail.ok || mail.skipped) {
      // skipped = sem RESEND — ainda marca para não spammar em loop de logs
      await prisma.setting.upsert({
        where: { key },
        update: { value: String(remaining) },
        create: { key, value: String(remaining) },
      });
    }

    return {
      checked: true,
      remaining,
      emailed: Boolean(mail.ok),
      error: mail.ok ? undefined : mail.error || (mail.skipped ? 'resend ausente' : 'falha e-mail'),
    };
  } catch (e) {
    console.error('[lote-alert]', e);
    return {
      checked: true,
      error: e instanceof Error ? e.message : 'erro',
    };
  }
}

/** Varre todos os lotes ativos (cron / manual) */
export async function scanLowStockAlerts(): Promise<{
  scanned: number;
  emailed: number;
  critical: number;
}> {
  const lotes = await prisma.lote.findMany({
    where: { ativo: true },
    select: { id: true, totalQty: true, sold: true },
  });
  let emailed = 0;
  let critical = 0;
  for (const l of lotes) {
    const rem = remainingOf(l.totalQty, l.sold);
    if (rem <= LOTE_EMAIL_REMAINING) critical += 1;
    if (rem <= LOTE_WARN_REMAINING) {
      const r = await checkLoteLowStockAlert(l.id);
      if (r.emailed) emailed += 1;
    }
  }
  return { scanned: lotes.length, emailed, critical };
}
