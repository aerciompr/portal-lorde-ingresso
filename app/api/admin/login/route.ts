import { NextRequest, NextResponse } from 'next/server';
import { setAdminSession, verifyPassword } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import type { StaffRole } from '@/lib/staff-roles';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
const ADMIN_PASS =
  process.env.ADMIN_PASSWORD ||
  (process.env.NODE_ENV === 'production' ? '' : 'admin123');

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function timingSafePassword(provided: string, expected: string): boolean {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  if (!expected || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit({
    key: `admin-login:${clientIp(req)}`,
    limit: 15,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Muitas tentativas de login. Aguarde e tente de novo.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  let email = '';
  let password = '';
  try {
    const body = await req.json();
    email = String(body.email || '')
      .toLowerCase()
      .trim();
    password = String(body.password || '');
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // 1) Superadmin do .env (sempre)
  if (ADMIN_PASS) {
    const emailOk = !ADMIN_EMAIL || email === ADMIN_EMAIL;
    if (emailOk && timingSafePassword(password, ADMIN_PASS)) {
      await setAdminSession(email || ADMIN_EMAIL || 'admin', 'superadmin');
      return NextResponse.json({
        ok: true,
        role: 'superadmin' as StaffRole,
        redirect: '/admin',
      });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // sem env: tenta só usuários do banco
  }

  // 2) Usuário staff no banco
  try {
    const user = await prisma.staffUser.findUnique({ where: { email } });
    if (user && user.active) {
      const ok = await verifyPassword(password, user.passwordHash);
      if (ok) {
        const role = (user.role === 'admin' ? 'admin' : 'checkin') as StaffRole;
        await setAdminSession(user.email, role);
        await prisma.staffUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        return NextResponse.json({
          ok: true,
          role,
          name: user.name,
          redirect: role === 'checkin' ? '/checkin' : '/admin',
        });
      }
    }
  } catch (e) {
    console.error('[ADMIN LOGIN] staff user lookup', e);
  }

  if (process.env.NODE_ENV === 'production' && !ADMIN_PASS) {
    // se não há env e não autenticou no banco
  }

  return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
}
