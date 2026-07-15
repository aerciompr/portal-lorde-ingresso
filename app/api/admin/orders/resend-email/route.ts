import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  sendOrderConfirmation,
  sendAccessCodesEmail,
  type OrderWithDetails,
} from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { requireAdminMutation } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Mode = 'confirmation' | 'access_code' | 'both';

/**
 * Admin: reenvia e-mail de confirmação (com PDF) e/ou código LN.
 * Não altera pedido nem tokens de gateway.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const rl = rateLimit({
    key: `admin-resend-email`,
    limit: 60,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Muitos reenvios. Aguarde um pouco.' },
      { status: 429 }
    );
  }

  let body: { orderId?: string; mode?: Mode; toEmail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const orderId = (body.orderId || '').trim();
  const mode: Mode = body.mode || 'confirmation';
  if (!orderId) {
    return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });
  }
  if (!['confirmation', 'access_code', 'both'].includes(mode)) {
    return NextResponse.json({ error: 'mode inválido' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      event: true,
      lote: true,
      tickets: { include: { ticketType: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  }

  const toEmail = (body.toEmail || order.buyerEmail || '').trim().toLowerCase();
  if (!toEmail.includes('@')) {
    return NextResponse.json({ error: 'E-mail do comprador inválido' }, { status: 400 });
  }

  const results: {
    confirmation?: { ok: boolean; error?: string; skipped?: boolean; attachments?: number };
    accessCode?: { ok: boolean; error?: string; skipped?: boolean };
  } = {};

  // Confirmação com PDFs — só pedidos pagos (ingresso válido)
  if (mode === 'confirmation' || mode === 'both') {
    if ((order.status || '').toLowerCase() !== 'paid') {
      results.confirmation = {
        ok: false,
        error: 'E-mail com PDF de ingresso só para pedidos pagos',
      };
    } else if (!order.tickets?.length) {
      results.confirmation = { ok: false, error: 'Pedido sem ingressos' };
    } else {
      try {
        const payload: OrderWithDetails = {
          id: order.id,
          buyerName: order.buyerName,
          buyerEmail: toEmail,
          totalCents: order.totalCents,
          accessCode: order.accessCode,
          event: {
            title: order.event.title,
            date: order.event.date,
            address: order.event.address,
            openTime: order.event.openTime,
            imageUrl: order.event.imageUrl,
          },
          lote: order.lote,
          tickets: order.tickets.map((t) => ({
            id: t.id,
            uniqueCode: t.uniqueCode,
            qrPayload: t.qrPayload,
            ticketType: {
              name: t.ticketType.name,
              priceCents: t.ticketType.priceCents,
            },
          })),
        };
        const mail = await sendOrderConfirmation(payload);
        results.confirmation = {
          ok: !!mail.ok,
          error: (mail as { error?: string }).error,
          skipped: (mail as { skipped?: boolean }).skipped,
          attachments: (mail as { attachments?: number }).attachments,
        };
        if (mail.ok) {
          await prisma.order.update({
            where: { id: order.id },
            data: { emailSentAt: new Date() },
          });
        }
      } catch (e) {
        results.confirmation = { ok: false, error: (e as Error).message };
      }
    }
  }

  // Só código LN (funciona com paid/refunded se tiver accessCode)
  if (mode === 'access_code' || mode === 'both') {
    if (!order.accessCode) {
      results.accessCode = { ok: false, error: 'Pedido sem código de acesso' };
    } else {
      try {
        const mail = await sendAccessCodesEmail({
          to: toEmail,
          buyerName: order.buyerName,
          codes: [
            {
              accessCode: order.accessCode,
              eventTitle: order.event.title,
              orderId: order.id,
            },
          ],
        });
        results.accessCode = {
          ok: !!mail.ok,
          error: (mail as { error?: string }).error,
          skipped: (mail as { skipped?: boolean }).skipped,
        };
      } catch (e) {
        results.accessCode = { ok: false, error: (e as Error).message };
      }
    }
  }

  const ok =
    (results.confirmation?.ok || results.confirmation === undefined) &&
    (results.accessCode?.ok || results.accessCode === undefined) &&
    (results.confirmation !== undefined || results.accessCode !== undefined);

  // partial success: confirmation ok but access failed etc.
  const anyOk = !!(results.confirmation?.ok || results.accessCode?.ok);
  const anyFail = !!(
    (results.confirmation && !results.confirmation.ok) ||
    (results.accessCode && !results.accessCode.ok)
  );

  if (!anyOk) {
    const err =
      results.confirmation?.error ||
      results.accessCode?.error ||
      'Falha ao reenviar e-mail';
    return NextResponse.json({ error: err, results }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    partial: anyFail,
    to: toEmail,
    results,
    message: anyFail
      ? 'Parte do reenvio falhou — veja details'
      : 'E-mail reenviado com sucesso',
  });
}
