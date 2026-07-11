import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cleanDigits } from '@/lib/masks';
import { sendAccessCodesEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rate limit simples em memória (por processo)
const hits = new Map<string, { n: number; t: number }>();

function rateLimit(key: string, max = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || now - cur.t > windowMs) {
    hits.set(key, { n: 1, t: now });
    return true;
  }
  if (cur.n >= max) return false;
  cur.n += 1;
  return true;
}

/**
 * POST { email?: string, cpf?: string }
 * Envia por e-mail os códigos de acesso dos pedidos pagos desse comprador.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let email = String(body.email || '')
      .trim()
      .toLowerCase();
    let cpf = cleanDigits(String(body.cpf || ''));

    if (!cpf && /^\d{11}$/.test(cleanDigits(email))) {
      cpf = cleanDigits(email);
      email = '';
    }

    if (!email && !cpf) {
      return NextResponse.json(
        { error: 'Informe o e-mail ou CPF usado na compra' },
        { status: 400 }
      );
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rlKey = `${ip}:${email || cpf}`;
    if (!rateLimit(rlKey)) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
        { status: 429 }
      );
    }

    const where: {
      status: { in: string[] };
      accessCode: { not: null };
      OR?: Array<Record<string, unknown>>;
      buyerEmail?: { equals: string };
      buyerCpf?: string;
    } = {
      status: { in: ['paid', 'refunded', 'cancelled'] },
      accessCode: { not: null },
    };

    if (email && cpf) {
      where.OR = [{ buyerEmail: { equals: email } }, { buyerCpf: cpf }];
    } else if (email) {
      where.buyerEmail = { equals: email };
    } else {
      where.buyerCpf = cpf;
    }

    const orders = await prisma.order.findMany({
      where: where as never,
      include: { event: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Resposta genérica (não revela se o e-mail existe)
    const genericOk = {
      success: true,
      message:
        'Se houver pedidos com esse e-mail/CPF, enviamos o(s) código(s) para o e-mail da compra. Confira a caixa de entrada e o spam.',
    };

    if (!orders.length) {
      return NextResponse.json(genericOk);
    }

    const to = orders[0].buyerEmail;
    if (!to?.includes('@')) {
      return NextResponse.json(
        { error: 'Este pedido não tem e-mail válido para reenvio.' },
        { status: 400 }
      );
    }

    const codes = orders
      .filter((o) => o.accessCode)
      .map((o) => ({
        accessCode: o.accessCode as string,
        eventTitle: o.event.title,
        orderId: o.id,
      }));

    // Dedup por código
    const seen = new Set<string>();
    const unique = codes.filter((c) => {
      if (seen.has(c.accessCode)) return false;
      seen.add(c.accessCode);
      return true;
    });

    const mail = await sendAccessCodesEmail({
      to,
      buyerName: orders[0].buyerName,
      codes: unique,
    });

    if (!mail.ok) {
      console.error('[resend-code]', mail.error);
      return NextResponse.json(
        {
          error:
            mail.skipped
              ? 'Envio de e-mail não configurado no servidor (RESEND_API_KEY).'
              : mail.error || 'Falha ao enviar e-mail. Tente mais tarde.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ...genericOk,
      sentToHint: to.replace(/(.{2}).+(@.+)/, '$1***$2'),
    });
  } catch (e) {
    console.error('[resend-code]', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
