import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function prismaErrorMessage(e: unknown): string {
  const err = e as {
    code?: string;
    message?: string;
    meta?: { target?: string | string[]; column_name?: string };
  };
  if (err?.code === 'P2002') {
    return 'Já existe registro com o mesmo valor único (slug ou código). Tente outro título.';
  }
  if (err?.code === 'P2000') {
    return 'Algum texto é longo demais para o banco. Encurte a descrição ou rode prisma db push (campos TEXT).';
  }
  if (err?.code === 'P1001' || err?.message?.includes("Can't reach database")) {
    return 'Não foi possível conectar ao MySQL. Verifique DATABASE_URL e se o serviço MySQL está no ar.';
  }
  if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
    return 'Tabela ausente no banco. No container: npx prisma db push --schema=./prisma/schema.prisma';
  }
  // mensagem útil sem vazar stack inteira
  const msg = err?.message || String(e);
  if (msg.length > 280) return msg.slice(0, 280) + '…';
  return msg || 'Erro desconhecido ao salvar evento';
}

function parseEventDate(raw: string): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  // datetime-local: "2026-08-14T20:00" (sem timezone)
  const d = new Date(raw.length === 16 ? `${raw}:00` : raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const events = await prisma.event.findMany({
      include: {
        ticketTypes: true,
        lotes: { orderBy: { ordem: 'asc' } },
        activeLote: true,
      },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(events);
  } catch (e) {
    console.error('[admin/events GET]', e);
    return NextResponse.json({ error: prismaErrorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  try {
    const body = await req.json();
    const title = String(body.title || '').trim();
    const date = parseEventDate(String(body.date || ''));

    if (!title || title.length < 2) {
      return NextResponse.json(
        { error: 'Título é obrigatório (mín. 2 caracteres)' },
        { status: 400 }
      );
    }
    if (title.length > 500) {
      return NextResponse.json({ error: 'Título muito longo' }, { status: 400 });
    }
    if (!date) {
      return NextResponse.json(
        { error: 'Data inválida. Use o campo Data e Hora do formulário.' },
        { status: 400 }
      );
    }

    const slugBase = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80);
    const slug = `${slugBase || 'evento'}-${Date.now().toString(36).slice(-6)}`;

    // R$ 0,20 = 20 centavos — não usar `|| 3500` (0 e valores baixos são válidos)
    const price =
      body.priceCents != null && body.priceCents !== ''
        ? Math.max(0, parseInt(String(body.priceCents), 10) || 0)
        : 3500;
    const totalQty =
      body.qty != null && body.qty !== ''
        ? Math.max(1, parseInt(String(body.qty), 10) || 1)
        : 150;
    const loteNome = String(body.loteNome || '1º Lote').trim() || '1º Lote';

    const salesDeadline = body.salesDeadline
      ? parseEventDate(String(body.salesDeadline))
      : null;

    // Criação em passos (evita falha opaca de nested create + FK circular activeLote)
    const event = await prisma.event.create({
      data: {
        title,
        slug,
        date,
        openTime: body.openTime ? String(body.openTime).slice(0, 32) : null,
        description: body.description ? String(body.description) : null,
        imageUrl: body.imageUrl ? String(body.imageUrl) : null,
        address:
          body.address ||
          'Rua Silvério Jorge, 241, Jaraguá, Maceió - AL, 57022-110',
        location: body.location ? String(body.location) : null,
        salesDeadline,
        footerNotice: body.footerNotice?.trim() || null,
        hidden: body.hidden === true || body.hidden === '1' || body.hidden === 1,
        allowCancel: body.allowCancel !== false,
        cancelHoursBefore: parseInt(String(body.cancelHoursBefore || 24), 10) || 24,
        cancelFeePercent: parseFloat(String(body.cancelFeePercent ?? 10)) || 10,
        loteAcrescimoCents:
          body.loteAcrescimoCents != null
            ? parseInt(String(body.loteAcrescimoCents), 10) || 500
            : 500,
        loteDefaultQty:
          body.loteDefaultQty != null
            ? parseInt(String(body.loteDefaultQty), 10) || 50
            : 50,
      },
    });

    await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: loteNome,
        priceCents: price,
        totalQty,
      },
    });

    const lote = await prisma.lote.create({
      data: {
        eventId: event.id,
        nome: loteNome,
        precoCents: price,
        totalQty,
        ordem: 1,
        viradaAutomatica: true,
        ativo: true,
      },
    });

    try {
      await prisma.event.update({
        where: { id: event.id },
        data: { activeLoteId: lote.id },
      });
    } catch (e) {
      // Lote já está ativo=true; listagens usam isso como fallback
      console.error('[admin/events POST] activeLoteId update failed (evento já criado):', e);
    }

    const full = await prisma.event.findUnique({
      where: { id: event.id },
      include: {
        ticketTypes: true,
        lotes: true,
        activeLote: true,
      },
    });

    return NextResponse.json(full || { ...event, activeLoteId: lote.id });
  } catch (e) {
    console.error('[admin/events POST]', e);
    return NextResponse.json(
      {
        error: prismaErrorMessage(e),
        hint: 'No console do container: npx prisma db push --schema=./prisma/schema.prisma',
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  try {
    const body = await req.json();
    const { id } = body;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    const exists = await prisma.event.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const t = String(body.title || '').trim();
      if (t.length < 2) {
        return NextResponse.json({ error: 'Título inválido' }, { status: 400 });
      }
      data.title = t;
    }
    if (body.date) {
      const d = parseEventDate(String(body.date));
      if (!d) return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
      data.date = d;
    }
    if (body.description !== undefined) data.description = body.description || null;
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl || null;
    if (body.address) data.address = body.address;
    if (body.location !== undefined) data.location = body.location || null;
    if (body.openTime !== undefined) data.openTime = body.openTime || null;
    if (body.footerNotice !== undefined) {
      data.footerNotice = (body.footerNotice || '').trim() || null;
    }
    if (body.salesDeadline !== undefined) {
      data.salesDeadline = body.salesDeadline
        ? parseEventDate(String(body.salesDeadline))
        : null;
    }
    if (body.hidden !== undefined) {
      data.hidden =
        body.hidden === true || body.hidden === '1' || body.hidden === 1;
    }
    if (body.allowCancel !== undefined) data.allowCancel = !!body.allowCancel;
    if (body.cancelHoursBefore != null) {
      data.cancelHoursBefore = parseInt(String(body.cancelHoursBefore), 10) || 24;
    }
    if (body.cancelFeePercent != null) {
      data.cancelFeePercent = parseFloat(String(body.cancelFeePercent)) || 10;
    }
    if (body.loteAcrescimoCents !== undefined) {
      data.loteAcrescimoCents = parseInt(String(body.loteAcrescimoCents), 10) || 0;
    }
    if (body.loteDefaultQty !== undefined) {
      data.loteDefaultQty = parseInt(String(body.loteDefaultQty), 10) || 50;
    }

    if (Object.keys(data).length > 0) {
      await prisma.event.update({ where: { id }, data });
    }

    if (body.addTicketType) {
      const { name, priceCents, totalQty } = body.addTicketType;
      if (name && priceCents != null) {
        await prisma.ticketType.create({
          data: {
            eventId: id,
            name: String(name),
            priceCents: parseInt(String(priceCents), 10) || 0,
            totalQty: parseInt(String(totalQty || 50), 10) || 50,
          },
        });
      }
    }

    const fresh = await prisma.event.findUnique({
      where: { id },
      include: {
        ticketTypes: true,
        lotes: { orderBy: { ordem: 'asc' } },
        activeLote: true,
      },
    });
    return NextResponse.json(fresh);
  } catch (e) {
    console.error('[admin/events PUT]', e);
    return NextResponse.json({ error: prismaErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await prisma.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[admin/events DELETE]', e);
    return NextResponse.json({ error: prismaErrorMessage(e) }, { status: 500 });
  }
}
