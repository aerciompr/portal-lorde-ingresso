import { NextRequest, NextResponse } from 'next/server';
import { setAdminSession } from '@/lib/auth';
import crypto from 'crypto';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const emailOk = !ADMIN_EMAIL || String(email || '').toLowerCase().trim() === ADMIN_EMAIL;
  const provided = Buffer.from(String(password || ''));
  const expected = Buffer.from(ADMIN_PASS);

  if (!emailOk || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  }

  await setAdminSession(email);
  return NextResponse.json({ ok: true });
}
