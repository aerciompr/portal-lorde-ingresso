import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orders = await prisma.order.findMany({
    include: {
      event: { select: { title: true } },
      lote: { select: { nome: true } },
      tickets: {
        select: {
          id: true,
          uniqueCode: true,
          status: true,
          ticketType: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });
  // Nunca devolver hash de senha do comprador no admin list
  const safe = orders.map((o) => {
    const { buyerPasswordHash, ...rest } = o as typeof o & { buyerPasswordHash?: string | null };
    return { ...rest, hasPassword: Boolean(buyerPasswordHash) };
  });
  return NextResponse.json(safe);
}
