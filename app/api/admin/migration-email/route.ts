import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import {
  buildMigrationNoticeHtml,
  sendMigrationNotice,
  MIGRATION_EMAIL_MARKER,
  DEFAULT_MIGRATION_INTRO,
} from '@/lib/email-migration';
import type { OrderWithDetails } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Select explícito — evita quebrar se colunas novas (emailSentAt) ainda não existirem no MySQL */
const orderSelect = {
  id: true,
  buyerName: true,
  buyerEmail: true,
  totalCents: true,
  accessCode: true,
  feeDetails: true,
  paidAt: true,
  status: true,
  source: true,
  eventId: true,
  event: {
    select: {
      id: true,
      title: true,
      date: true,
      address: true,
      openTime: true,
      imageUrl: true,
    },
  },
  lote: { select: { nome: true } },
  tickets: {
    where: { status: { not: 'cancelled' } },
    select: {
      id: true,
      uniqueCode: true,
      qrPayload: true,
      ticketType: { select: { name: true, priceCents: true } },
    },
  },
} as const;

type LoadedOrder = {
  id: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  accessCode: string | null;
  feeDetails: string | null;
  paidAt: Date | null;
  event: {
    id: string;
    title: string;
    date: Date;
    address: string;
    openTime: string | null;
    imageUrl: string | null;
  };
  lote: { nome: string } | null;
  tickets: Array<{
    id: string;
    uniqueCode: string;
    qrPayload: string | null;
    ticketType: { name: string; priceCents: number };
  }>;
};

function toPayload(order: LoadedOrder): OrderWithDetails {
  return {
    id: order.id,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    totalCents: order.totalCents,
    accessCode: order.accessCode,
    event: order.event,
    lote: order.lote,
    tickets: order.tickets,
  };
}

function prismaErrorHint(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('emailSentAt')) {
    return (
      'Coluna Order.emailSentAt ausente no MySQL. Rode: ' +
      'ALTER TABLE `Order` ADD COLUMN `emailSentAt` DATETIME(3) NULL;'
    );
  }
  if (msg.includes('hidden') && msg.includes('Event')) {
    return (
      'Coluna Event.hidden ausente. Rode: ' +
      'ALTER TABLE `Event` ADD COLUMN `hidden` TINYINT(1) NOT NULL DEFAULT 0;'
    );
  }
  if (msg.includes('OrderLog') || msg.includes('orderLog')) {
    return 'Tabela OrderLog ausente. Rode o SQL em scripts/sql-add-order-log.sql';
  }
  return msg.slice(0, 500);
}

async function loadCandidates(opts: {
  eventId?: string;
  onlyNotSent?: boolean;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(200, Math.max(1, opts.limit || 50));
  const offset = Math.max(0, opts.offset || 0);

  const orders = (await prisma.order.findMany({
    where: {
      source: 'woocommerce',
      status: 'paid',
      buyerEmail: { contains: '@' },
      ...(opts.eventId ? { eventId: opts.eventId } : {}),
    },
    select: orderSelect,
    orderBy: { paidAt: 'desc' },
    take: 500,
  })) as unknown as LoadedOrder[];

  let list = orders.filter((o) => (o.tickets?.length || 0) > 0);
  if (opts.onlyNotSent !== false) {
    list = list.filter(
      (o) => !(o.feeDetails || '').includes(MIGRATION_EMAIL_MARKER)
    );
  }

  const total = list.length;
  const slice = list.slice(offset, offset + limit);

  return {
    total,
    limit,
    offset,
    orders: slice.map((o) => ({
      id: o.id,
      buyerName: o.buyerName,
      buyerEmail: o.buyerEmail,
      accessCode: o.accessCode,
      eventTitle: o.event.title,
      ticketCount: o.tickets.length,
      alreadySent: (o.feeDetails || '').includes(MIGRATION_EMAIL_MARKER),
      paidAt: o.paidAt,
    })),
    full: slice,
  };
}

/**
 * GET ?action=stats|preview
 * POST action=preview|send-test|send-batch
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const action = req.nextUrl.searchParams.get('action') || 'stats';
    const eventId = req.nextUrl.searchParams.get('eventId') || undefined;

    if (action === 'stats') {
      const all = await loadCandidates({ eventId, onlyNotSent: false, limit: 500 });
      const pending = all.orders.filter((o) => !o.alreadySent);
      const events = await prisma.event.findMany({
        where: {
          orders: { some: { source: 'woocommerce', status: 'paid' } },
        },
        select: { id: true, title: true, date: true },
        orderBy: { date: 'asc' },
      });
      return NextResponse.json({
        totalImportedPaid: all.total,
        pendingSend: pending.length,
        alreadySent: all.total - pending.length,
        events,
        defaultIntro: DEFAULT_MIGRATION_INTRO,
        sample: all.orders.slice(0, 15),
      });
    }

    if (action === 'preview') {
      const orderId = req.nextUrl.searchParams.get('orderId') || '';
      let order = orderId
        ? ((await prisma.order.findUnique({
            where: { id: orderId },
            select: orderSelect,
          })) as unknown as LoadedOrder | null)
        : null;

      if (!order) {
        const c = await loadCandidates({ eventId, onlyNotSent: false, limit: 1 });
        order = c.full[0] || null;
      }

      if (!order) {
        return NextResponse.json(
          { error: 'Nenhum pedido importado pago para pré-visualizar' },
          { status: 404 }
        );
      }

      const introHtml = req.nextUrl.searchParams.get('intro') || undefined;
      const built = await buildMigrationNoticeHtml(toPayload(order), { introHtml });
      return NextResponse.json({
        ok: true,
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        buyerName: order.buyerName,
        eventTitle: order.event.title,
        subject: built.subject,
        html: built.html,
        appUrl: built.appUrl,
      });
    }

    return NextResponse.json({ error: 'action inválida' }, { status: 400 });
  } catch (e) {
    console.error('[migration-email GET]', e);
    return NextResponse.json(
      {
        error: 'Falha ao carregar e-mail de migração',
        detail: prismaErrorHint(e),
        hint: 'Confira colunas no MySQL (emailSentAt, Event.hidden) — veja scripts/sql-*.sql',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  let body: {
    action?: string;
    eventId?: string;
    orderId?: string;
    toEmail?: string;
    subject?: string;
    introHtml?: string;
    attachPdf?: boolean;
    limit?: number;
    dryRun?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido no body da requisição' }, { status: 400 });
  }

  try {
    const action = body.action || 'preview';
    const attachPdf = body.attachPdf !== false;

    if (action === 'preview') {
      const introHtml = body.introHtml;
      let order = body.orderId
        ? ((await prisma.order.findUnique({
            where: { id: body.orderId },
            select: orderSelect,
          })) as unknown as LoadedOrder | null)
        : null;
      if (!order) {
        const c = await loadCandidates({
          eventId: body.eventId,
          onlyNotSent: false,
          limit: 1,
        });
        order = c.full[0] || null;
      }
      if (!order) {
        return NextResponse.json({ error: 'Sem pedido para preview' }, { status: 404 });
      }
      const built = await buildMigrationNoticeHtml(toPayload(order), { introHtml });
      return NextResponse.json({
        ok: true,
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        subject: body.subject || built.subject,
        html: built.html,
      });
    }

    if (action === 'send-test') {
      const toEmail = (body.toEmail || '').trim().toLowerCase();
      if (!toEmail.includes('@')) {
        return NextResponse.json({ error: 'Informe toEmail de teste' }, { status: 400 });
      }
      let order = body.orderId
        ? ((await prisma.order.findUnique({
            where: { id: body.orderId },
            select: orderSelect,
          })) as unknown as LoadedOrder | null)
        : null;
      if (!order) {
        const c = await loadCandidates({
          eventId: body.eventId,
          onlyNotSent: false,
          limit: 1,
        });
        order = c.full[0] || null;
      }
      if (!order) {
        return NextResponse.json({ error: 'Sem pedido modelo' }, { status: 404 });
      }

      const mail = await sendMigrationNotice(toPayload(order), {
        toOverride: toEmail,
        subject: body.subject ? `[TESTE] ${body.subject}` : undefined,
        introHtml: body.introHtml,
        attachPdf,
      });
      return NextResponse.json({
        ...mail,
        testTo: toEmail,
        orderId: order.id,
        message: mail.ok
          ? `E-mail de teste enviado para ${toEmail}`
          : mail.error || 'Falha no envio (confira RESEND_API_KEY e FROM_EMAIL)',
      });
    }

    if (action === 'send-batch') {
      const limit = Math.min(50, Math.max(1, body.limit || 20));
      const c = await loadCandidates({
        eventId: body.eventId,
        onlyNotSent: true,
        limit,
        offset: 0,
      });

      if (body.dryRun) {
        return NextResponse.json({
          ok: true,
          dryRun: true,
          wouldSend: c.orders.length,
          totalPending: c.total,
          sample: c.orders.slice(0, 10),
        });
      }

      const results: Array<{ orderId: string; email: string; ok: boolean; error?: string }> =
        [];
      let sent = 0;
      let failed = 0;

      for (const full of c.full) {
        const mail = await sendMigrationNotice(toPayload(full), {
          subject: body.subject,
          introHtml: body.introHtml,
          attachPdf,
        });
        if (mail.ok) {
          sent += 1;
          const prev = full.feeDetails || '';
          const next = [prev, MIGRATION_EMAIL_MARKER, new Date().toISOString().slice(0, 10)]
            .filter(Boolean)
            .join(' | ')
            .slice(0, 250);
          try {
            await prisma.order.update({
              where: { id: full.id },
              data: { feeDetails: next },
            });
          } catch (e) {
            console.warn('[migration-email] mark sent failed', full.id, e);
          }
        } else {
          failed += 1;
        }
        results.push({
          orderId: full.id,
          email: full.buyerEmail,
          ok: mail.ok,
          error: mail.error,
        });
        await new Promise((r) => setTimeout(r, 350));
      }

      return NextResponse.json({
        ok: true,
        sent,
        failed,
        batchSize: c.full.length,
        totalPendingAfter: Math.max(0, c.total - sent),
        results: results.slice(0, 30),
        message: `Enviados ${sent}, falhas ${failed} (lote de ${c.full.length})`,
      });
    }

    return NextResponse.json({ error: 'action inválida' }, { status: 400 });
  } catch (e) {
    console.error('[migration-email POST]', e);
    return NextResponse.json(
      {
        error: 'Erro 500 na rotina de e-mail de migração',
        detail: prismaErrorHint(e),
        hint: 'Se faltar coluna no MySQL, rode o ALTER TABLE. Se for Resend, confira RESEND_API_KEY.',
      },
      { status: 500 }
    );
  }
}
