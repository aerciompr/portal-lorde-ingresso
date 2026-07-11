/**
 * Notificação WhatsApp opcional pós-pagamento.
 * Não usa API oficial embutida: se WHATSAPP_NOTIFY_WEBHOOK estiver setado,
 * faz POST JSON (integra n8n / Twilio / Evolution / etc.).
 *
 * Env:
 * - WHATSAPP_NOTIFY_WEBHOOK=https://...
 * - WHATSAPP_NOTIFY_TOKEN= (opcional Authorization Bearer)
 */

export async function notifyWhatsAppPaid(params: {
  phone?: string | null;
  buyerName?: string | null;
  email?: string | null;
  accessCode?: string | null;
  eventTitle?: string | null;
  orderId: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const url = (process.env.WHATSAPP_NOTIFY_WEBHOOK || '').trim();
  if (!url) return { ok: false, skipped: true };

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = (process.env.WHATSAPP_NOTIFY_TOKEN || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'order_paid',
        ...params,
        message: `Olá ${params.buyerName || ''}! Pagamento confirmado para ${params.eventTitle || 'seu evento'}. Código: ${params.accessCode || '—'}. Acesse Meus Ingressos.`,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `webhook HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
