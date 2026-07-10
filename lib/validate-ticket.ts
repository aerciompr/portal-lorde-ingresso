import crypto from 'crypto';

function getTicketSecret(): string {
  const s = process.env.TICKET_SECRET || '';
  if (!s) {
    // Não derruba o boot do Next no cPanel; falha só ao assinar/verificar
    console.error('[validate-ticket] TICKET_SECRET não configurado');
    return 'missing-ticket-secret-configure-env';
  }
  return s;
}

export function signCode(code: string): string {
  const hmac = crypto.createHmac('sha256', getTicketSecret());
  hmac.update(code);
  return `${code}.${hmac.digest('hex').slice(0, 12)}`;
}

export function verifyPayload(payload: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 2) return null;
  const code = parts[0];
  const expected = signCode(code);
  return expected === payload ? code : null;
}
