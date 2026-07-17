import { Resend } from 'resend';
import { getAppSettings } from './settings';
import type { OrderWithDetails } from './email';

function cleanEnv(raw?: string | null): string {
  return (raw || '').trim().replace(/^['"]+|['"]+$/g, '');
}

function getFromEmail(): string {
  return cleanEnv(process.env.FROM_EMAIL) || 'onboarding@resend.dev';
}

function getResendKey(): string {
  return cleanEnv(process.env.RESEND_API_KEY);
}

async function getAppUrl() {
  try {
    const s = await getAppSettings();
    return (s.publicUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
      /\/$/,
      ''
    );
  } catch {
    return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  }
}

export type MigrationEmailOptions = {
  /** Título do e-mail (assunto) */
  subject?: string;
  /** Texto intro (HTML simples ou plain — vira parágrafos) */
  introHtml?: string;
  /** Anexar PDFs dos ingressos */
  attachPdf?: boolean;
  /** Destino forçado (teste) */
  toOverride?: string;
};

const DEFAULT_INTRO = `
<p>Boa notícia: o <strong>portal de ingressos do Lorde Nelson</strong> foi atualizado.</p>
<p>Seu ingresso comprado no site antigo continua válido. Agora você consulta e baixa o PDF em um só lugar, com código de acesso e QR Code na entrada.</p>
<p><strong>O que mudou para você:</strong></p>
<ul style="line-height:1.7;padding-left:18px;color:#ccc;">
  <li>Novo endereço do portal de ingressos</li>
  <li>Área <strong>Meus Ingressos</strong> com e-mail + código</li>
  <li>PDF do ingresso em anexo neste e-mail (quando disponível)</li>
  <li>Suporte pelo WhatsApp e e-mail de sempre</li>
</ul>
`;

export function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Monta HTML do e-mail de migração (preview + envio usam a mesma função).
 */
export async function buildMigrationNoticeHtml(
  order: OrderWithDetails,
  options?: { introHtml?: string; appUrl?: string }
): Promise<{ html: string; subject: string; appUrl: string }> {
  const APP_URL = options?.appUrl || (await getAppUrl());
  const intro = (options?.introHtml || DEFAULT_INTRO).trim() || DEFAULT_INTRO;

  const ticketLinks = (order.tickets || [])
    .map(
      (t) =>
        `<li style="margin-bottom:8px;"><strong>${escapeHtml(t.ticketType?.name || 'Ingresso')}</strong><br/>
        <span style="color:#aaa;font-size:13px;">Código: </span>
        <code style="background:#222;padding:2px 8px;border-radius:4px;">${escapeHtml(t.uniqueCode)}</code></li>`
    )
    .join('');

  const eventDate = new Date(order.event.date).toLocaleDateString('pt-BR', {
    timeZone: 'America/Maceio',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const accessUrl = `${APP_URL}/ingressos?email=${encodeURIComponent(order.buyerEmail || '')}${
    order.accessCode ? `&code=${encodeURIComponent(order.accessCode)}` : ''
  }`;

  const subject = `Seus ingressos no novo portal — ${order.event.title}`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;">
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;padding:24px 20px;background:#111;color:#eee;">
    <div style="text-align:center;padding-bottom:16px;border-bottom:1px solid #333;">
      <div style="font-size:11px;letter-spacing:3px;color:#22c55e;text-transform:uppercase;">Lorde Nelson Rest Pub</div>
      <h1 style="color:#fff;font-size:22px;margin:12px 0 4px;font-weight:600;">Portal de ingressos atualizado</h1>
    </div>

    <p style="margin-top:20px;">Olá <strong>${escapeHtml(order.buyerName || 'Cliente')}</strong>,</p>

    <div style="line-height:1.55;color:#ddd;">
      ${intro}
    </div>

    <div style="margin:24px 0;padding:16px;background:#1a1a1a;border-radius:12px;border:1px solid #333;">
      <div style="font-size:11px;color:#22c55e;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Seu evento</div>
      <div style="font-size:18px;font-weight:600;color:#fff;margin-bottom:8px;">${escapeHtml(order.event.title)}</div>
      <p style="margin:0;font-size:14px;color:#aaa;line-height:1.6;">
        <strong style="color:#ccc;">Data:</strong> ${eventDate}<br/>
        <strong style="color:#ccc;">Abertura:</strong> ${escapeHtml(order.event.openTime || '20:00')}<br/>
        <strong style="color:#ccc;">Local:</strong> ${escapeHtml(order.event.address || 'Lorde Nelson — Maceió/AL')}
        ${order.lote?.nome ? `<br/><strong style="color:#ccc;">Lote:</strong> ${escapeHtml(order.lote.nome)}` : ''}
      </p>
    </div>

    ${
      order.accessCode
        ? `<div style="margin:20px 0;padding:16px;background:#0f1f12;border-radius:12px;border:1px solid #22c55e44;text-align:center;">
      <div style="font-size:12px;color:#86efac;margin-bottom:8px;">Código de acesso · Meus Ingressos</div>
      <code style="font-size:22px;letter-spacing:2px;background:#0a0a0a;padding:10px 16px;border-radius:8px;display:inline-block;color:#fff;">${escapeHtml(order.accessCode)}</code>
      <p style="font-size:12px;color:#888;margin:12px 0 0;">Guarde este código. Use com o e-mail da compra.</p>
    </div>`
        : ''
    }

    ${
      ticketLinks
        ? `<h3 style="margin:24px 0 10px;font-size:15px;color:#fff;">Seus ingressos</h3>
    <ul style="line-height:1.6;padding-left:18px;margin:0;color:#ddd;">${ticketLinks}</ul>`
        : ''
    }

    <p style="margin-top:20px;padding:14px;background:#1a2e1a;border-radius:10px;border:1px solid #22c55e33;font-size:14px;">
      📎 <strong>PDF do ingresso</strong> (quando anexado): abra no celular ou imprima para a entrada. O QR Code é único.
    </p>

    <p style="text-align:center;margin:28px 0 12px;">
      <a href="${accessUrl}" style="display:inline-block;background:#22c55e;color:#052e16;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:10px;font-size:15px;">
        Abrir Meus Ingressos
      </a>
    </p>
    <p style="text-align:center;font-size:12px;color:#666;word-break:break-all;">
      ${escapeHtml(accessUrl)}
    </p>

    <p style="font-size:13px;color:#888;margin-top:32px;line-height:1.55;">
      Dúvidas: <a href="mailto:contato@lordenelson.com.br" style="color:#22c55e;">contato@lordenelson.com.br</a>
      ou pelo WhatsApp informado no site (Admin → Contato).
    </p>
    <p style="margin-top:28px;font-size:11px;color:#555;border-top:1px solid #222;padding-top:16px;">
      Lorde Nelson Rest Pub · Rua Silvério Jorge, 241 · Jaraguá · Maceió/AL<br/>
      Este e-mail refere-se ao pedido importado do site anterior.
    </p>
  </div>
</body>
</html>
`.trim();

  return { html, subject, appUrl: APP_URL };
}

export async function sendMigrationNotice(
  order: OrderWithDetails,
  options?: MigrationEmailOptions
): Promise<{ ok: boolean; error?: string; skipped?: boolean; id?: string; attachments?: number }> {
  const apiKey = getResendKey();
  if (!apiKey) {
    return { ok: false, skipped: true, error: 'RESEND_API_KEY não configurada' };
  }

  const to = (options?.toOverride || order.buyerEmail || '').trim().toLowerCase();
  if (!to.includes('@')) {
    return { ok: false, error: 'E-mail do comprador inválido' };
  }

  const { html, subject: defaultSubject } = await buildMigrationNoticeHtml(order, {
    introHtml: options?.introHtml,
  });
  const subject = (options?.subject || defaultSubject).slice(0, 200);

  const attachments: Array<{ filename: string; content: Buffer }> = [];
  if (options?.attachPdf !== false) {
    try {
      const { generateTicketPDF } = await import('@/lib/generate-ticket');
      const { formatDate } = await import('@/lib/utils');
      const { signCode } = await import('@/lib/validate-ticket');
      for (const t of (order.tickets || []).slice(0, 8)) {
        try {
          const qrPayload = t.qrPayload || signCode(t.uniqueCode);
          const pdfBytes = await generateTicketPDF({
            eventTitle: order.event.title,
            eventDate: formatDate(order.event.date) + ' • ' + (order.event.openTime || ''),
            buyerName: order.buyerName,
            buyerEmail: order.buyerEmail,
            ticketType: order.lote?.nome || t.ticketType.name,
            uniqueCode: t.uniqueCode,
            qrPayload,
            address: order.event.address,
            priceCents: t.ticketType.priceCents ?? 0,
            imageUrl: order.event.imageUrl,
          });
          attachments.push({
            filename: `ingresso-${t.uniqueCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
            content: Buffer.from(pdfBytes),
          });
        } catch (e) {
          console.error('[EMAIL migration] PDF', t.uniqueCode, e);
        }
      }
    } catch (e) {
      console.error('[EMAIL migration] anexos', e);
    }
  }

  const resend = new Resend(apiKey);
  const from = getFromEmail();

  try {
    const result = await resend.emails.send({
      from: from.includes('<') ? from : `Lorde Nelson <${from}>`,
      to,
      subject,
      html,
      attachments: attachments.length
        ? attachments.map((a) => ({ filename: a.filename, content: a.content }))
        : undefined,
    });
    if (result.error) {
      return { ok: false, error: result.error.message || JSON.stringify(result.error) };
    }
    return { ok: true, id: result.data?.id, attachments: attachments.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha no envio' };
  }
}

export const MIGRATION_EMAIL_MARKER = 'migration-email-sent';

export { DEFAULT_INTRO as DEFAULT_MIGRATION_INTRO };
