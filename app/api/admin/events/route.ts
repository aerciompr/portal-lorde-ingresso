import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const events = await prisma.event.findMany({
    include: { 
      ticketTypes: true,
      lotes: { orderBy: { ordem: 'asc' } },
      activeLote: true,
    },
    orderBy: { date: 'desc' },
  });
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { title, date, priceCents, qty } = body;

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36).slice(-4);

  const event = await prisma.event.create({
    data: {
      title,
      slug,
      date: new Date(date),
      description: body.description || null,
      imageUrl: body.imageUrl || null,
      address: body.address || 'Rua Silvério Jorge, 241, Jaraguá, Maceió - AL, 57022-110',
      location: body.location || null,
      cancelHoursBefore: body.cancelHoursBefore || 24,
      cancelFeePercent: body.cancelFeePercent || 10,
      ticketTypes: {
        create: [{
          name: 'Ingresso Padrão',
          priceCents: priceCents || 3500,
          totalQty: qty || 150,
        }],
      },
      lotes: {
        create: [{
          nome: 'Lote Promocional',
          precoCents: priceCents || 3500,
          totalQty: qty || 150,
          ordem: 1,
          viradaAutomatica: true,
          ativo: true,
        }],
      },
    },
  });

  // Set the activeLote to the created one (simplified, in real would get the id)
  // For now, we'll set it in a follow up or use the first
  const createdLote = await prisma.lote.findFirst({ where: { eventId: event.id }, orderBy: { createdAt: 'desc' } });
  if (createdLote) {
    await prisma.event.update({
      where: { id: event.id },
      data: { activeLoteId: createdLote.id },
    });
  }

  return NextResponse.json(event);
}

// Simple update for title/date (extend as needed)
export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const data: any = {};

  if (body.title) data.title = body.title;
  if (body.date) data.date = new Date(body.date);
  if (body.description !== undefined) data.description = body.description || null;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl || null;
  if (body.address) data.address = body.address;
  if (body.location !== undefined) data.location = body.location || null;
  if (body.openTime !== undefined) data.openTime = body.openTime || null;
  if (body.salesDeadline) data.salesDeadline = new Date(body.salesDeadline);
  if (body.allowCancel !== undefined) data.allowCancel = !!body.allowCancel;
  if (body.cancelHoursBefore) data.cancelHoursBefore = parseInt(body.cancelHoursBefore);
  if (body.cancelFeePercent) data.cancelFeePercent = parseFloat(body.cancelFeePercent);
  if (body.loteAcrescimoCents !== undefined) data.loteAcrescimoCents = parseInt(body.loteAcrescimoCents);
  if (body.loteDefaultQty !== undefined) data.loteDefaultQty = parseInt(body.loteDefaultQty);

  const updated = await prisma.event.update({
    where: { id },
    data,
  });

  // Support adding new TicketType from edit page (for "Novo ingresso")
  if (body.addTicketType) {
    const { name, priceCents, totalQty } = body.addTicketType;
    if (name && priceCents != null) {
      await prisma.ticketType.create({
        data: {
          eventId: id,
          name,
          priceCents: parseInt(priceCents),
          totalQty: parseInt(totalQty || 50),
        },
      });
    }
  }

  // Return fresh data
  const fresh = await prisma.event.findUnique({
    where: { id },
    include: { ticketTypes: true, lotes: { orderBy: { ordem: 'asc' } } },
  });
  return NextResponse.json(fresh || updated);
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

