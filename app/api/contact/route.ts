import { NextRequest, NextResponse } from 'next/server';
import { getAppSettings } from '@/lib/settings';
import { sendContactFormMessage } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/request-security';

const SUBJECTS = new Set(['Ingressos', 'Evento', 'Parceria', 'Outro']);

export async function POST(req: NextRequest) {
  const originOk = assertSameOrigin(req);
  // Em dev same-origin é permissivo; em prod exige origin
  if (originOk !== true && process.env.NODE_ENV === 'production') {
    return originOk;
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const rl = rateLimit({ key: `contact:${ip}`, limit: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Muitas mensagens. Tente novamente em alguns minutos.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // Honeypot: bots preenchem "website"
  if (String(body.website || body.company || '').trim()) {
    return NextResponse.json({ ok: true }); // silencioso
  }

  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
  const subjectRaw = String(body.subject || 'Outro').trim();
  const subject = SUBJECTS.has(subjectRaw) ? subjectRaw : 'Outro';
  const message = String(body.message || '').trim().slice(0, 4000);

  if (name.length < 2) {
    return NextResponse.json({ error: 'Informe seu nome' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: 'Mensagem muito curta' }, { status: 400 });
  }

  const s = await getAppSettings();
  const to =
    s.contact.contactEmail ||
    s.fromEmail ||
    process.env.FROM_EMAIL ||
    'contato@lordenelson.com.br';

  const result = await sendContactFormMessage({
    name,
    email,
    subject,
    message,
    to,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.error ||
          'Não foi possível enviar. Tente WhatsApp ou tente mais tarde.',
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
