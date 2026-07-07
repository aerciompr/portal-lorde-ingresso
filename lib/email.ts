import { Resend } from 'resend';

const FROM = process.env.FROM_EMAIL || 'ingressos@lordenelson.com.br';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export interface OrderWithDetails {
  id: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  accessCode?: string;
  event: {
    title: string;
    date: Date | string;
    address: string;
    openTime?: string;
  };
  tickets: Array<{
    id: string;
    uniqueCode: string;
    ticketType: { name: string };
  }>;
}

export async function sendOrderConfirmation(order: OrderWithDetails) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[EMAIL] RESEND_API_KEY not set - skipping real email. Order:', order.id);
    return { skipped: true };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const ticketLinks = order.tickets.map(t => 
    `<li><strong>${t.ticketType.name}</strong> — Código: <code>${t.uniqueCode}</code> — <a href="${APP_URL}/ingressos?email=${encodeURIComponent(order.buyerEmail)}">Baixar PDF</a></li>`
  ).join('');

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111; color: #eee;">
      <h1 style="color: #fff;">Lorde Nelson Rest Pub</h1>
      <h2>Compra confirmada!</h2>
      
      <p>Olá ${order.buyerName || 'Cliente'},</p>
      
      <p>Seu pedido para <strong>${order.event.title}</strong> foi confirmado com sucesso.</p>
      
      <p><strong>Data:</strong> ${new Date(order.event.date).toLocaleDateString('pt-BR')} às ${order.event.openTime || '20:00'}<br>
      <strong>Local:</strong> ${order.event.address}</p>

      ${order.accessCode ? `<p><strong>Código de acesso:</strong> <code>${order.accessCode}</code> (guarde para acessar seus ingressos)</p>` : ''}
      
      <h3 style="margin-top:24px;">Seus ingressos:</h3>
      <ul style="line-height: 1.8;">
        ${ticketLinks}
      </ul>
      
      <p style="margin-top: 24px;">
        Acesse <a href="${APP_URL}/ingressos?email=${encodeURIComponent(order.buyerEmail)}${order.accessCode ? `&code=${order.accessCode}` : ''}" style="color:#22c55e;">Meus Ingressos</a> a qualquer momento para baixar os PDFs com QR Code.
      </p>
      
      <p style="font-size: 13px; color: #888; margin-top: 32px;">
        Apresente o QR Code na entrada. O código é único e intransferível.<br>
        Qualquer dúvida: contato@lordenelson.com.br ou WhatsApp (82) 99647-1998
      </p>
      
      <p style="margin-top:40px; font-size:12px; color:#555;">Lorde Nelson • Maceió/AL</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: order.buyerEmail,
      subject: `Ingressos confirmados - ${order.event.title}`,
      html,
    });
    console.log('[EMAIL] Confirmation sent to', order.buyerEmail, result);
    return result;
  } catch (err) {
    console.error('[EMAIL] Error sending confirmation', err);
    throw err;
  }
}

export async function sendCancellationApproved(order: OrderWithDetails, refundAmountCents?: number) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[EMAIL] Skipped cancellation email (no key)');
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const amount = refundAmountCents ? (refundAmountCents / 100).toFixed(2) : 'o valor integral';
  
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111; color: #eee;">
      <h1>Lorde Nelson Rest Pub</h1>
      <h2>Cancelamento aprovado</h2>
      
      <p>Olá ${order.buyerName},</p>
      
      <p>Seu pedido <strong>${order.id}</strong> para o evento <strong>${order.event?.title}</strong> foi cancelado com sucesso.</p>
      
      <p>O estorno de <strong>R$ ${amount}</strong> será processado em até 5-10 dias úteis no método de pagamento original (Pix ou Cartão).</p>
      
      <p>Se precisar de ajuda, entre em contato conosco.</p>
      
      <p style="margin-top:40px; font-size:12px; color:#555;">Lorde Nelson • contato@lordenelson.com.br</p>
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to: order.buyerEmail,
    subject: `Cancelamento aprovado - ${order.event?.title || 'Lorde Nelson'}`,
    html,
  });
}
