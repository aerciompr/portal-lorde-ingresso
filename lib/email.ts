import { Resend } from 'resend';
import { getAppSettings } from './settings';
import { formatPrice } from './utils';

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

export interface OrderWithDetails {
  id: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  accessCode?: string | null;
  event: {
    title: string;
    date: Date | string;
    address: string;
    openTime?: string | null;
    imageUrl?: string | null;
  };
  lote?: { nome: string } | null;
  tickets: Array<{
    id: string;
    uniqueCode: string;
    qrPayload?: string | null;
    ticketType: { name: string; priceCents?: number };
  }>;
}

/**
 * Envia confirmação com PDF(s) do ingresso em anexo.
 * Resend NÃO lança erro em falha de domínio — vem em result.error.
 */
export async function sendOrderConfirmation(order: OrderWithDetails) {
  const apiKey = getResendKey();
  if (!apiKey) {
    console.log('[EMAIL] RESEND_API_KEY ausente — e-mail não enviado. Order:', order.id);
    return { ok: false, skipped: true, error: 'RESEND_API_KEY não configurada' };
  }

  if (!order.buyerEmail?.includes('@')) {
    console.warn('[EMAIL] buyerEmail inválido', order.buyerEmail);
    return { ok: false, error: 'E-mail do comprador inválido' };
  }

  const resend = new Resend(apiKey);
  const APP_URL = await getAppUrl();
  const from = getFromEmail();

  const ticketLinks = order.tickets
    .map(
      (t) =>
        `<li><strong>${t.ticketType.name}</strong> — Código: <code>${t.uniqueCode}</code></li>`
    )
    .join('');

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111; color: #eee;">
      <h1 style="color: #fff;">Lorde Nelson Rest Pub</h1>
      <h2>Compra confirmada!</h2>
      
      <p>Olá ${order.buyerName || 'Cliente'},</p>
      
      <p>Seu pedido para <strong>${order.event.title}</strong> foi confirmado com sucesso.</p>
      
      <p><strong>Data:</strong> ${new Date(order.event.date).toLocaleDateString('pt-BR')} às ${order.event.openTime || '20:00'}<br>
      <strong>Local:</strong> ${order.event.address}</p>

      ${order.accessCode ? `<p><strong>Código de acesso:</strong> <code style="font-size:18px;background:#222;padding:4px 8px;border-radius:6px;">${order.accessCode}</code><br><span style="font-size:13px;color:#aaa;">Use em Meus Ingressos se ainda não tiver senha.</span></p>` : ''}
      
      <h3 style="margin-top:24px;">Seus ingressos:</h3>
      <ul style="line-height: 1.8;">
        ${ticketLinks}
      </ul>

      <p style="margin-top:16px;padding:12px;background:#1a2e1a;border-radius:8px;border:1px solid #22c55e44;">
        📎 <strong>O PDF do ingresso está em anexo</strong> neste e-mail (um arquivo por ingresso). Abra no celular ou imprima para a entrada.
      </p>
      
      <p style="margin-top: 24px;">
        Também pode acessar <a href="${APP_URL}/ingressos?email=${encodeURIComponent(order.buyerEmail)}${order.accessCode ? `&code=${order.accessCode}` : ''}" style="color:#22c55e;">Meus Ingressos</a> a qualquer momento.
      </p>
      
      <p style="font-size: 13px; color: #888; margin-top: 32px;">
        Apresente o QR Code na entrada. O código é único e intransferível.<br>
        Qualquer dúvida: contato@lordenelson.com.br ou WhatsApp (82) 99647-1998
      </p>
      
      <p style="margin-top:40px; font-size:12px; color:#555;">Lorde Nelson • Maceió/AL</p>
    </div>
  `;

  // PDFs em anexo (máx. 8 para não estourar limite do e-mail)
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  try {
    const { generateTicketPDF } = await import('@/lib/generate-ticket');
    const { formatDate } = await import('@/lib/utils');
    const { signCode } = await import('@/lib/validate-ticket');

    const tickets = order.tickets.slice(0, 8);
    for (const t of tickets) {
      try {
        const qrPayload = t.qrPayload || signCode(t.uniqueCode);
        const pdfBytes = await generateTicketPDF({
          eventTitle: order.event.title,
          eventDate:
            formatDate(order.event.date) + ' • ' + (order.event.openTime || ''),
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          ticketType: order.lote?.nome || t.ticketType.name,
          uniqueCode: t.uniqueCode,
          qrPayload,
          address: order.event.address,
          priceCents: t.ticketType.priceCents ?? 0,
          imageUrl: order.event.imageUrl,
        });
        const safeCode = t.uniqueCode.replace(/[^a-zA-Z0-9_-]/g, '_');
        attachments.push({
          filename: `ingresso-${safeCode}.pdf`,
          content: Buffer.from(pdfBytes),
        });
      } catch (e) {
        console.error('[EMAIL] falha ao gerar PDF do ticket', t.uniqueCode, e);
      }
    }
  } catch (e) {
    console.error('[EMAIL] não foi possível montar anexos PDF (envia sem anexo):', e);
  }

  try {
    const result = await resend.emails.send({
      from: from.includes('<') ? from : `Lorde Nelson <${from}>`,
      to: order.buyerEmail,
      subject: `Ingressos confirmados - ${order.event.title}`,
      html,
      attachments: attachments.length
        ? attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
          }))
        : undefined,
    });

    // SDK Resend devolve { data, error } sem throw
    if (result.error) {
      console.error('[EMAIL] Resend recusou o envio:', result.error, {
        from,
        to: order.buyerEmail,
        orderId: order.id,
      });
      return {
        ok: false,
        error: result.error.message || JSON.stringify(result.error),
      };
    }

    console.log('[EMAIL] Confirmation sent', {
      to: order.buyerEmail,
      from,
      id: result.data?.id,
      orderId: order.id,
      attachments: attachments.length,
    });
    return { ok: true, id: result.data?.id, attachments: attachments.length };
  } catch (err) {
    console.error('[EMAIL] Error sending confirmation', err);
    throw err;
  }
}

/** Reenvio de código(s) de acesso por e-mail (Meus Ingressos) */
export async function sendAccessCodesEmail(params: {
  to: string;
  buyerName?: string | null;
  codes: Array<{ accessCode: string; eventTitle: string; orderId: string }>;
}) {
  const apiKey = getResendKey();
  if (!apiKey) {
    return { ok: false, skipped: true, error: 'RESEND_API_KEY não configurada' };
  }
  if (!params.to?.includes('@') || !params.codes.length) {
    return { ok: false, error: 'Dados incompletos' };
  }

  const resend = new Resend(apiKey);
  const APP_URL = await getAppUrl();
  const from = getFromEmail();

  const list = params.codes
    .map(
      (c) =>
        `<li style="margin-bottom:12px;"><strong>${c.eventTitle}</strong><br/>
        Código: <code style="font-size:18px;background:#222;padding:4px 10px;border-radius:6px;letter-spacing:2px;">${c.accessCode}</code>
        <br/><a href="${APP_URL}/ingressos?email=${encodeURIComponent(params.to)}&code=${encodeURIComponent(c.accessCode)}" style="color:#22c55e;font-size:13px;">Abrir Meus Ingressos</a></li>`
    )
    .join('');

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111; color: #eee;">
      <h1 style="color:#fff;">Lorde Nelson Rest Pub</h1>
      <h2>Seu código de acesso</h2>
      <p>Olá ${params.buyerName || 'Cliente'},</p>
      <p>Você solicitou o reenvio do(s) código(s) de acesso aos ingressos:</p>
      <ul style="line-height:1.6;padding-left:18px;">${list}</ul>
      <p style="font-size:13px;color:#888;margin-top:24px;">
        Em Meus Ingressos use a aba <strong>Código</strong> e cole o LN-… Não compartilhe este e-mail.
      </p>
      <p style="margin-top:32px;font-size:12px;color:#555;">Lorde Nelson • Maceió/AL</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: from.includes('<') ? from : `Lorde Nelson <${from}>`,
      to: params.to,
      subject:
        params.codes.length === 1
          ? `Código de acesso ${params.codes[0].accessCode} — Lorde Nelson`
          : `Seus códigos de acesso (${params.codes.length}) — Lorde Nelson`,
      html,
    });
    if (result.error) {
      console.error('[EMAIL] resend-code error', result.error);
      return { ok: false, error: result.error.message || JSON.stringify(result.error) };
    }
    console.log('[EMAIL] access codes sent to', params.to, result.data?.id);
    return { ok: true, id: result.data?.id };
  } catch (e) {
    console.error('[EMAIL] resend-code exception', e);
    throw e;
  }
}

/** Formulário público /contato → e-mail do pub */
export async function sendContactFormMessage(params: {
  name: string;
  email: string;
  subject: string;
  message: string;
  to: string;
}) {
  const apiKey = getResendKey();
  if (!apiKey) {
    console.log('[EMAIL] RESEND_API_KEY ausente — contato não enviado');
    return { ok: false, skipped: true, error: 'E-mail não configurado no servidor' };
  }

  const to = (params.to || '').trim();
  if (!to.includes('@')) {
    return { ok: false, error: 'Destino de contato inválido' };
  }

  const resend = new Resend(apiKey);
  const from = getFromEmail();
  const safeName = params.name.replace(/[<>]/g, '').slice(0, 120);
  const safeSubject = params.subject.replace(/[<>]/g, '').slice(0, 120);
  const safeMsg = params.message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #222;">
      <h2 style="margin:0 0 12px;">Contato pelo site</h2>
      <p style="margin:0 0 8px;"><strong>De:</strong> ${safeName} &lt;${params.email}&gt;</p>
      <p style="margin:0 0 8px;"><strong>Assunto:</strong> ${safeSubject}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />
      <div style="line-height:1.5;">${safeMsg}</div>
      <p style="margin-top:24px;font-size:12px;color:#888;">Enviado pelo formulário de contato do portal.</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: from.includes('<') ? from : `Lorde Nelson Portal <${from}>`,
      to,
      replyTo: params.email,
      subject: `[Site] ${safeSubject} — ${safeName}`,
      html,
    });
    if (result.error) {
      console.error('[EMAIL] contact Resend error', result.error);
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[EMAIL] contact exception', e);
    return { ok: false, error: (e as Error).message };
  }
}

export async function sendCancellationApproved(
  order: OrderWithDetails,
  refundAmountCents?: number
) {
  const apiKey = getResendKey();
  if (!apiKey) {
    console.log('[EMAIL] Skipped cancellation email (no key)');
    return { ok: false, skipped: true };
  }

  const resend = new Resend(apiKey);
  const from = getFromEmail();

  const amount =
    refundAmountCents != null ? formatPrice(refundAmountCents) : 'o valor integral';

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111; color: #eee;">
      <h1>Lorde Nelson Rest Pub</h1>
      <h2>Cancelamento aprovado</h2>
      
      <p>Olá ${order.buyerName},</p>
      
      <p>Seu pedido <strong>${order.id}</strong> para o evento <strong>${order.event?.title}</strong> foi cancelado com sucesso.</p>
      
      <p>O estorno de <strong>${amount}</strong> será processado em até 5-10 dias úteis no método de pagamento original (Pix ou Cartão).</p>
      
      <p>Se precisar de ajuda, entre em contato conosco.</p>
      
      <p style="margin-top:40px; font-size:12px; color:#555;">Lorde Nelson • contato@lordenelson.com.br</p>
    </div>
  `;

  const result = await resend.emails.send({
    from: from.includes('<') ? from : `Lorde Nelson <${from}>`,
    to: order.buyerEmail,
    subject: `Cancelamento aprovado - ${order.event?.title || 'Lorde Nelson'}`,
    html,
  });

  if (result.error) {
    console.error('[EMAIL] cancellation Resend error', result.error);
    return { ok: false, error: result.error.message };
  }
  return { ok: true };
}
