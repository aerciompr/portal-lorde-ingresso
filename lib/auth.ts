import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const ADMIN_COOKIE = 'admin_session';
const ADMIN_USER_COOKIE = 'admin_user';

export async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_COOKIE)?.value === '1';
}

export async function setAdminSession(userEmail?: string) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  });
  if (userEmail) {
    cookieStore.set(ADMIN_USER_COOKIE, userEmail, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 8,
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
  return cookieStore.get(ADMIN_USER_COOKIE)?.value || null;
}

// Client (buyer) password helpers
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
