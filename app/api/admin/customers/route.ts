import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import { cleanDigits, isValidPhone } from '@/lib/masks';
import type { Prisma } from '@prisma/client';

type Agg = {
  key: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  zip: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  ordersCount: number;
  paidCount: number;
  refundedCount: number;
  pendingCount: number;
  cancelledCount: number;
  totalSpentCents: number;
  totalTickets: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  hasPassword: boolean;
  sources: string[];
  recentOrders: {
    id: string;
    status: string;
    totalCents: number;
    createdAt: string;
    paidAt: string | null;
    accessCode: string | null;
    eventTitle: string;
    ticketCount: number;
  }[];
};

function customerKey(email: string | null | undefined, cpf: string | null | undefined): string | null {
  const e = (email || '').trim().toLowerCase();
  if (e && e.includes('@') && e !== 'checkout@pending.local') return `email:${e}`;
  const c = (cpf || '').replace(/\D/g, '');
  if (c.length >= 11) return `cpf:${c}`;
  return null;
}

/**
 * GET /api/admin/customers
 * Agrega compradores a partir de pedidos (e-mail ou CPF).
 * Mantido por design: sem tabela Customer separada.
 * Otimizado: ignora pending abandonados; tickets via _count (sem carregar cada ingresso).
 * ?q=  &page=1&limit=50&sort=recent|spent|orders|name
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
  const sort = (searchParams.get('sort') || 'recent').toLowerCase();

  // Só pedidos com comprador identificável; pula "Checkout em andamento" pending
  const where: Prisma.OrderWhereInput = {
    AND: [
      {
        OR: [
          { buyerEmail: { contains: '@' } },
          { buyerCpf: { not: null } },
        ],
      },
      {
        NOT: {
          AND: [{ buyerName: 'Checkout em andamento' }, { status: 'pending' }],
        },
      },
    ],
  };

  // Hard cap defensivo: se passar disso, ainda agrega (admin raro), mas evita timeout extremo
  const MAX_ORDERS = 50_000;

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      buyerName: true,
      buyerEmail: true,
      buyerCpf: true,
      buyerPhone: true,
      buyerZip: true,
      buyerStreet: true,
      buyerNumber: true,
      buyerComplement: true,
      buyerNeighborhood: true,
      buyerCity: true,
      buyerState: true,
      buyerPasswordHash: true,
      status: true,
      totalCents: true,
      accessCode: true,
      createdAt: true,
      paidAt: true,
      source: true,
      event: { select: { title: true } },
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_ORDERS,
  });

  const map = new Map<string, Agg>();
  const truncated = orders.length >= MAX_ORDERS;

  for (const o of orders) {
    const key = customerKey(o.buyerEmail, o.buyerCpf);
    if (!key) continue;

    const email = (o.buyerEmail || '').trim().toLowerCase();
    const status = (o.status || '').toLowerCase();
    const ticketCount = o._count?.tickets ?? 0;
    const createdIso = o.createdAt.toISOString();
    const paidIso = o.paidAt ? o.paidAt.toISOString() : null;

    let row = map.get(key);
    if (!row) {
      row = {
        key,
        name: (o.buyerName || '').trim() || '—',
        email: email.includes('@') ? email : '',
        cpf: o.buyerCpf || null,
        phone: o.buyerPhone || null,
        zip: o.buyerZip || null,
        street: o.buyerStreet || null,
        number: o.buyerNumber || null,
        complement: o.buyerComplement || null,
        neighborhood: o.buyerNeighborhood || null,
        city: o.buyerCity || null,
        state: o.buyerState || null,
        ordersCount: 0,
        paidCount: 0,
        refundedCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
        totalSpentCents: 0,
        totalTickets: 0,
        firstOrderAt: createdIso,
        lastOrderAt: createdIso,
        hasPassword: Boolean(o.buyerPasswordHash),
        sources: [],
        recentOrders: [],
      };
      map.set(key, row);
    }

    row.ordersCount += 1;
    if (status === 'paid') {
      row.paidCount += 1;
      row.totalSpentCents += o.totalCents || 0;
      row.totalTickets += ticketCount;
    } else if (status === 'refunded') {
      row.refundedCount += 1;
    } else if (status === 'pending') {
      row.pendingCount += 1;
    } else if (status === 'cancelled' || status === 'canceled') {
      row.cancelledCount += 1;
    }

    if (o.buyerPasswordHash) row.hasPassword = true;
    if (o.source && !row.sources.includes(o.source)) row.sources.push(o.source);

    // Preferir dados do pedido mais recente (lista já vem desc)
    if (row.ordersCount === 1 || (row.lastOrderAt && createdIso >= row.lastOrderAt)) {
      if ((o.buyerName || '').trim() && o.buyerName !== 'Checkout em andamento') {
        row.name = o.buyerName.trim();
      }
      if (email.includes('@')) row.email = email;
      if (o.buyerCpf) row.cpf = o.buyerCpf;
      if (o.buyerPhone) row.phone = o.buyerPhone;
      if (o.buyerZip) row.zip = o.buyerZip;
      if (o.buyerStreet) row.street = o.buyerStreet;
      if (o.buyerNumber) row.number = o.buyerNumber;
      if (o.buyerComplement) row.complement = o.buyerComplement;
      if (o.buyerNeighborhood) row.neighborhood = o.buyerNeighborhood;
      if (o.buyerCity) row.city = o.buyerCity;
      if (o.buyerState) row.state = o.buyerState;
      row.lastOrderAt = createdIso;
    }
    if (!row.firstOrderAt || createdIso < row.firstOrderAt) {
      row.firstOrderAt = createdIso;
    }

    if (row.recentOrders.length < 8) {
      row.recentOrders.push({
        id: o.id,
        status: o.status,
        totalCents: o.totalCents,
        createdAt: createdIso,
        paidAt: paidIso,
        accessCode: o.accessCode,
        eventTitle: o.event?.title || '—',
        ticketCount,
      });
    }
  }

  let list = Array.from(map.values());

  list = list.filter((c) => {
    if (c.name === 'Checkout em andamento' && c.paidCount === 0 && c.ordersCount <= 1) {
      return false;
    }
    return true;
  });

  if (q) {
    const qDigits = q.replace(/\D/g, '');
    list = list.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.email.includes(q)) return true;
      if (c.phone && c.phone.includes(qDigits || q)) return true;
      if (c.cpf && qDigits && c.cpf.replace(/\D/g, '').includes(qDigits)) return true;
      if (c.city && c.city.toLowerCase().includes(q)) return true;
      if (c.recentOrders.some((o) => o.eventTitle.toLowerCase().includes(q))) return true;
      if (c.recentOrders.some((o) => o.accessCode && o.accessCode.toLowerCase().includes(q)))
        return true;
      return false;
    });
  }

  if (sort === 'spent') {
    list.sort((a, b) => b.totalSpentCents - a.totalSpentCents || b.ordersCount - a.ordersCount);
  } else if (sort === 'orders') {
    list.sort((a, b) => b.ordersCount - a.ordersCount || b.totalSpentCents - a.totalSpentCents);
  } else if (sort === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  } else {
    list.sort((a, b) => (b.lastOrderAt || '').localeCompare(a.lastOrderAt || ''));
  }

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageSafe = Math.min(page, totalPages);
  const slice = list.slice((pageSafe - 1) * limit, pageSafe * limit);

  const summary = {
    totalCustomers: total,
    withPaidOrders: list.filter((c) => c.paidCount > 0).length,
    totalSpentCents: list.reduce((s, c) => s + c.totalSpentCents, 0),
    totalPaidOrders: list.reduce((s, c) => s + c.paidCount, 0),
  };

  return NextResponse.json({
    customers: slice,
    page: pageSafe,
    limit,
    total,
    totalPages,
    summary,
    ...(truncated
      ? {
          warning:
            'Lista limitada aos 50 mil pedidos mais recentes com cliente. Volume alto — se ficar lento no futuro, dá para extrair tabela Customer.',
        }
      : {}),
  });
}

const MAX_MATCH_ORDERS = 50_000;

/**
 * PATCH /api/admin/customers
 * Edita nome/e-mail/telefone do cliente, propagando para TODOS os pedidos
 * agregados sob a mesma key (email ou CPF) — mantém Clientes e Pedidos
 * consistentes, já que não existe tabela Customer separada (ver GET acima).
 * Body: { key: 'email:foo@bar.com' | 'cpf:12345678900', name?, email?, phone? }
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  let body: { key?: string; name?: string; email?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const key = (body.key || '').trim();
  const sep = key.indexOf(':');
  if (sep <= 0) {
    return NextResponse.json({ error: 'key inválida' }, { status: 400 });
  }
  const keyType = key.slice(0, sep);
  const keyValue = key.slice(sep + 1);
  if (!keyValue || (keyType !== 'email' && keyType !== 'cpf')) {
    return NextResponse.json({ error: 'key inválida' }, { status: 400 });
  }

  const name = body.name !== undefined ? body.name.trim() : undefined;
  const email = body.email !== undefined ? body.email.trim().toLowerCase() : undefined;
  const phone = body.phone !== undefined ? cleanDigits(body.phone) : undefined;

  if (name !== undefined && !name) {
    return NextResponse.json({ error: 'Nome não pode ficar vazio' }, { status: 400 });
  }
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  }
  if (phone !== undefined && phone && !isValidPhone(phone)) {
    return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 });
  }
  if (name === undefined && email === undefined && phone === undefined) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
  }

  // Localiza todos os pedidos do cliente pela key (mesma lógica de agregação do GET)
  let matchIds: string[];
  if (keyType === 'email') {
    const rows = await prisma.order.findMany({
      where: { buyerEmail: { contains: '@' } },
      select: { id: true, buyerEmail: true },
      take: MAX_MATCH_ORDERS,
    });
    matchIds = rows
      .filter((o) => (o.buyerEmail || '').trim().toLowerCase() === keyValue)
      .map((o) => o.id);
  } else {
    const rows = await prisma.order.findMany({
      where: { buyerCpf: { not: null } },
      select: { id: true, buyerCpf: true },
      take: MAX_MATCH_ORDERS,
    });
    matchIds = rows
      .filter((o) => cleanDigits(o.buyerCpf || '') === keyValue)
      .map((o) => o.id);
  }

  if (!matchIds.length) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
  }

  const data: Prisma.OrderUpdateManyMutationInput = {};
  const changes: string[] = [];
  if (name !== undefined) {
    data.buyerName = name;
    changes.push(`nome → ${name}`);
  }
  if (email !== undefined) {
    data.buyerEmail = email;
    changes.push(`e-mail → ${email}`);
  }
  if (phone !== undefined) {
    data.buyerPhone = phone || null;
    changes.push(`telefone → ${phone || '—'}`);
  }

  await prisma.order.updateMany({ where: { id: { in: matchIds } }, data });
  await prisma.orderLog.createMany({
    data: matchIds.map((orderId) => ({
      orderId,
      kind: 'note',
      title: 'Dados do cliente atualizados (admin)',
      detail: changes.join('; '),
    })),
  });

  return NextResponse.json({
    ok: true,
    updatedOrders: matchIds.length,
    newKey: email !== undefined ? `email:${email}` : key,
  });
}
