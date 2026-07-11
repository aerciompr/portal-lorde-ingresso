import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { cleanDigits } from '@/lib/masks';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawEmail = searchParams.get('email')?.trim() || '';
  const email = rawEmail.toLowerCase();
  const code = searchParams.get('code')?.toUpperCase().trim();
  let cpf = searchParams.get('cpf')?.replace(/\D/g, '');
  const password = searchParams.get('password');

  // Auto-detect CPF if the "email" field contains only digits (11 chars)
  if (!cpf && /^\d{11}$/.test(rawEmail.replace(/\D/g, ''))) {
    cpf = rawEmail.replace(/\D/g, '');
  }

  // Password login (email or cpf + senha) - preferred for clients
  if (password && (email || cpf)) {
    const where: any = {
      status: { in: ['paid', 'cancelled', 'refunded'] },
    };
    if (email && !/^\d{11}$/.test(email.replace(/\D/g, ''))) {
      where.buyerEmail = { contains: email };
    }
    if (cpf) where.buyerCpf = cpf;

    const candidates = await prisma.order.findMany({
      where,
      include: {
        event: true,
        tickets: { include: { ticketType: true } },
        cancellationRequests: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const matching: any[] = [];
    for (const o of candidates) {
      if (o.buyerPasswordHash && await verifyPassword(password, o.buyerPasswordHash)) {
        matching.push(o);
      }
    }
    return NextResponse.json({ orders: matching });
  }

  // Código de acesso: libera o pedido e, se possível, todos os pedidos pagos do mesmo e-mail
  if (code) {
    const order = await prisma.order.findUnique({
      where: { accessCode: code },
      include: {
        event: true,
        tickets: { include: { ticketType: true } },
        cancellationRequests: true,
      },
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

    // Lista todos os pedidos do mesmo comprador (vários eventos)
    const all = await prisma.order.findMany({
      where: {
        buyerEmail: order.buyerEmail,
        status: { in: ['paid', 'cancelled', 'refunded'] },
      },
      include: {
        event: true,
        tickets: { include: { ticketType: true } },
        cancellationRequests: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ orders: all.length ? all : [order] });
  }

  // Legacy cpf only (no password, no code) - for loading orders with CPF
  if (cpf && !email && !code && !password) {
    const orders = await prisma.order.findMany({
      where: {
        buyerCpf: cpf,
        status: { in: ['paid', 'cancelled', 'refunded'] },
      },
      include: {
        event: true,
        tickets: { include: { ticketType: true } },
        cancellationRequests: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ orders });
  }

  // Legacy email only (no password, shows paid etc)
  if (!email) return NextResponse.json({ orders: [] });

  const orders = await prisma.order.findMany({
    where: {
      buyerEmail: { contains: email },
      status: { in: ['paid', 'cancelled', 'refunded'] },
    },
    include: {
      event: true,
      tickets: { include: { ticketType: true } },
      cancellationRequests: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, code, password, cpf: rawCpf } = body;

  if (!password || (!code && !email && !rawCpf)) {
    return NextResponse.json({ error: 'Dados incompletos (password + code ou email/cpf)' }, { status: 400 });
  }

  const providedEmail = email ? email.trim() : '';
  const providedCpf = rawCpf ? cleanDigits(rawCpf) : (providedEmail && /^\d{11}$/.test(cleanDigits(providedEmail)) ? cleanDigits(providedEmail) : '');

  let order = null;

  if (code) {
    // Verify ownership via code (optionally matching the provided email or cpf)
    const where: any = {
      accessCode: code.toUpperCase(),
    };
    if (providedEmail && !providedCpf) {
      where.buyerEmail = { contains: providedEmail.toLowerCase() };
    }
    if (providedCpf) {
      where.buyerCpf = providedCpf;
    }
    order = await prisma.order.findFirst({ where });
  } else {
    // Legacy: set password after loading via email/cpf only (no code)
    const where: any = {
      status: { in: ['paid', 'cancelled', 'refunded'] },
    };
    if (providedCpf) {
      where.buyerCpf = providedCpf;
    } else if (providedEmail) {
      where.buyerEmail = { contains: providedEmail.toLowerCase() };
    }
    order = await prisma.order.findFirst({ where });
  }

  if (!order) {
    return NextResponse.json({ error: 'Código ou credenciais inválidas para o email/CPF informado' }, { status: 401 });
  }

  const { hashPassword } = await import('@/lib/auth');
  const hash = await hashPassword(password);

  // Set password hash on orders matching this buyer's email or CPF (so login works with either)
  const updateWhere: any = { OR: [] };
  if (order.buyerEmail) updateWhere.OR.push({ buyerEmail: order.buyerEmail });
  if (order.buyerCpf) updateWhere.OR.push({ buyerCpf: order.buyerCpf });

  if (updateWhere.OR.length === 0) {
    // fallback to this order only
    await prisma.order.update({ where: { id: order.id }, data: { buyerPasswordHash: hash } });
  } else {
    await prisma.order.updateMany({
      where: updateWhere,
      data: { buyerPasswordHash: hash },
    });
  }

  return NextResponse.json({ success: true });
}
