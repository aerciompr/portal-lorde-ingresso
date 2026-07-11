import { NextRequest, NextResponse } from 'next/server';
import { setAdminSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
// Em produção, ADMIN_PASSWORD é obrigatório (sem default fraco)
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

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
    console.error('[ADMIN LOGIN] ADMIN_PASSWORD não configurado em produção');
    return NextResponse.json({ error: 'Admin não configurado no servidor' }, { status: 503 });
  }

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

  const { email, password } = await req.json();

  const emailOk = !ADMIN_EMAIL || String(email || '').toLowerCase().trim() === ADMIN_EMAIL;
  const provided = Buffer.from(String(password || ''));
  const expected = Buffer.from(ADMIN_PASS);

  if (!ADMIN_PASS || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected) || !emailOk) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  }

  await setAdminSession(email);
  return NextResponse.json({ ok: true });
}
