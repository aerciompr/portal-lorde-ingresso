import { NextRequest, NextResponse } from 'next/server';
import { setAdminSession } from '@/lib/auth';
import crypto from 'crypto';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
// Em produção, ADMIN_PASSWORD é obrigatório (sem default fraco)
const ADMIN_PASS =
  process.env.ADMIN_PASSWORD ||
  (process.env.NODE_ENV === 'production' ? '' : 'admin123');

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
    console.error('[ADMIN LOGIN] ADMIN_PASSWORD não configurado em produção');
    return NextResponse.json({ error: 'Admin não configurado no servidor' }, { status: 503 });
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
