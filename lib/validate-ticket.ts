import crypto from 'crypto';

const TICKET_SECRET = process.env.TICKET_SECRET!;
if (!TICKET_SECRET) {
  throw new Error('TICKET_SECRET is required');
}

export function signCode(code: string): string {
  const hmac = crypto.createHmac('sha256', TICKET_SECRET);
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
