import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { cleanDigits } from '@/lib/masks';
import { sanitizeOrdersForClient } from '@/lib/settings-public';
import { rateLimit } from '@/lib/rate-limit';

const ORDER_INCLUDE = {
  event: true,
  tickets: { include: { ticketType: true } },
  cancellationRequests: true,
} as const;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function limitOr429(req: NextRequest, action: string) {
  const rl = rateLimit({
    key: `lookup:${action}:${clientIp(req)}`,
    limit: 40,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde e tente de novo.', orders: [] },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }
  return null;
}

/**
 * GET — só com código de acesso LN-…
 * Senha NÃO vai na query string (use POST action=login).
 * Não lista por e-mail/CPF sozinho.
 */
export async function GET(req: NextRequest) {
  const blocked = limitOr429(req, 'get');
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const rawEmail = searchParams.get('email')?.trim() || '';
  const email = rawEmail.toLowerCase();
  const code = searchParams.get('code')?.toUpperCase().trim();
  let cpf = searchParams.get('cpf')?.replace(/\D/g, '');

  if (!cpf && /^\d{11}$/.test(rawEmail.replace(/\D/g, ''))) {
    cpf = rawEmail.replace(/\D/g, '');
  }

  // Senha na query: recusar (força cliente a usar POST)
  if (searchParams.get('password')) {
    return NextResponse.json(
      {
        error: 'Use o login por senha via formulário (POST). Não envie senha na URL.',
        orders: [],
      },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      {
        error: 'Informe o código LN-… da compra (ou entre com e-mail/CPF + senha).',
        orders: [],
      },
      { status: 400 }
    );
  }

  const order = await prisma.order.findUnique({
    where: { accessCode: code },
    include: ORDER_INCLUDE,
  });
  if (!order) return NextResponse.json({ orders: [] });

  const qEmail = email || '';
  const qCpf = cpf || '';
  const looksLikeCpf = /^\d{11}$/.test(qEmail.replace(/\D/g, ''));
  if (qEmail && !looksLikeCpf && !order.buyerEmail.toLowerCase().includes(qEmail.toLowerCase())) {
    return NextResponse.json({ orders: [] });
  }
  if (qCpf && order.buyerCpf && order.buyerCpf.replace(/\D/g, '') !== qCpf) {
    return NextResponse.json({ orders: [] });
  }

  const all = await prisma.order.findMany({
    where: {
      buyerEmail: order.buyerEmail,
      status: { in: ['paid', 'cancelled', 'refunded'] },
    },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    orders: sanitizeOrdersForClient((all.length ? all : [order]) as unknown as Record<string, unknown>[]),
  });
}

/**
 * POST
 * - { action: 'login', email|cpf, password } → lista pedidos
 * - { code, password, email? } → define senha (exige código LN)
 */
export async function POST(req: NextRequest) {
  const blocked = limitOr429(req, 'post');
  if (blocked) return blocked;

  const body = await req.json();
  const action = (body.action || '').toString();
  const email = (body.email || '').toString().trim();
  const code = (body.code || '').toString().toUpperCase().trim();
  const password = (body.password || '').toString();
  const rawCpf = body.cpf ? cleanDigits(String(body.cpf)) : '';

  // ── Login com senha ──
  if (action === 'login' || (password && !code && (email || rawCpf) && action !== 'set-password')) {
    if (!password || (!email && !rawCpf)) {
      return NextResponse.json(
        { error: 'Informe e-mail/CPF e senha', orders: [] },
        { status: 400 }
      );
    }

    const cpf =
      rawCpf ||
      (/^\d{11}$/.test(cleanDigits(email)) ? cleanDigits(email) : '');
    const emailQ = cpf && cleanDigits(email) === cpf ? '' : email.toLowerCase();

    const where: Record<string, unknown> = {
      status: { in: ['paid', 'cancelled', 'refunded'] },
    };
    if (emailQ && !/^\d{11}$/.test(emailQ.replace(/\D/g, ''))) {
      where.buyerEmail = { contains: emailQ };
    }
    if (cpf) where.buyerCpf = cpf;

    const candidates = await prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const matching = [];
    for (const o of candidates) {
      if (o.buyerPasswordHash && (await verifyPassword(password, o.buyerPasswordHash))) {
        matching.push(o);
      }
    }

    return NextResponse.json({
      orders: sanitizeOrdersForClient(matching as unknown as Record<string, unknown>[]),
    });
  }

  // ── Definir senha (exige código LN da compra) ──
  if (!password) {
    return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Senha com no mínimo 6 caracteres' }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json(
      { error: 'Para criar senha, use o código LN-… da compra' },
      { status: 400 }
    );
  }

  const providedEmail = email;
  const providedCpf =
    rawCpf ||
    (providedEmail && /^\d{11}$/.test(cleanDigits(providedEmail))
      ? cleanDigits(providedEmail)
      : '');

  const where: Record<string, unknown> = { accessCode: code };
  if (providedEmail && !providedCpf) {
    where.buyerEmail = { contains: providedEmail.toLowerCase() };
  }
  if (providedCpf) {
    where.buyerCpf = providedCpf;
  }

  const order = await prisma.order.findFirst({ where });
  if (!order) {
    return NextResponse.json(
      { error: 'Código inválido para o e-mail/CPF informado' },
      { status: 401 }
    );
  }

  const hash = await hashPassword(password);
  const updateWhere: { OR: { buyerEmail?: string; buyerCpf?: string }[] } = { OR: [] };
  if (order.buyerEmail) updateWhere.OR.push({ buyerEmail: order.buyerEmail });
  if (order.buyerCpf) updateWhere.OR.push({ buyerCpf: order.buyerCpf });

  if (updateWhere.OR.length === 0) {
    await prisma.order.update({ where: { id: order.id }, data: { buyerPasswordHash: hash } });
  } else {
    await prisma.order.updateMany({
      where: updateWhere,
      data: { buyerPasswordHash: hash },
    });
  }

  return NextResponse.json({ success: true });
}
