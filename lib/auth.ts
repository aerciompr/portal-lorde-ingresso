import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const ADMIN_COOKIE = 'admin_session';
const ADMIN_USER_COOKIE = 'admin_user';
const SESSION_MAX_AGE_SEC = 60 * 60 * 8; // 8h

/** Segredo para assinar cookie de admin (não é o valor “1”) */
function sessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    process.env.TICKET_SECRET ||
    'dev-only-change-me'
  );
}

function signAdminToken(email: string, exp: number): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, e: (email || 'admin').toLowerCase(), exp }),
    'utf8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(token: string | undefined | null): { ok: boolean; email?: string } {
  if (!token) return { ok: false };

  // Cookie legado "1" só em desenvolvimento — em produção exija token assinado (re-login)
  if (token === '1') {
    return { ok: process.env.NODE_ENV !== 'production' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false };
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false };
  } catch {
    return { ok: false };
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
      e?: string;
    };
    if (!data.exp || Date.now() > data.exp) return { ok: false };
    return { ok: true, email: data.e };
  } catch {
    return { ok: false };
  }
}

/** Valida cookie de admin (API routes + middleware) */
export function verifyAdminSessionCookie(value: string | undefined | null): boolean {
  return verifyAdminToken(value).ok;
}

export async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value).ok;
}

export async function setAdminSession(userEmail?: string) {
  const cookieStore = await cookies();
  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const token = signAdminToken(userEmail || 'admin', exp);
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_SEC,
    path: '/',
  });
  if (userEmail) {
    cookieStore.set(ADMIN_USER_COOKIE, userEmail, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE_SEC,
      path: '/',
    });
  }
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
  cookieStore.delete(ADMIN_USER_COOKIE);
}

export async function getAdminUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(ADMIN_USER_COOKIE)?.value;
  if (fromCookie) return fromCookie;
  const v = verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value);
  return v.email || null;
}

// Client (buyer) password helpers
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
