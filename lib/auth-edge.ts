/**
 * Verificação de cookie admin no Edge Middleware (Web Crypto).
 * Espelha lib/auth.ts (HMAC-SHA256 + payload base64url).
 */

function sessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    process.env.TICKET_SECRET ||
    'dev-only-change-me'
  );
}

function base64UrlToUint8Array(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uint8ToBase64Url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyAdminSessionCookie(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;

  // Compat: cookie legado admin_session=1 (até re-login pós-deploy)
  if (token === '1') {
    return true;
  }

  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(sessionSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expected = uint8ToBase64Url(mac);
    if (!timingSafeEqualStr(sig, expected)) return false;

    const json = new TextDecoder().decode(base64UrlToUint8Array(payload));
    const data = JSON.parse(json) as { exp?: number };
    if (!data.exp || Date.now() > data.exp) return false;
    return true;
  } catch {
    return false;
  }
}
