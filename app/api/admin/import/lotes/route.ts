import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminMutation } from '@/lib/request-security';
import { moneyToCents, parseLotesCsv } from '@/lib/csv-woo-import';

/**
 * Importa lotes (produtos Tribe) como Lote + TicketType no portal.
 * Marca esgotados (ativo=false, sold=totalQty).
 * POST: file + action=preview|import + replace=0|1
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const form = await req.formData();
  const action = String(form.get('action') || 'preview');
  const replace = String(form.get('replace') || '0') === '1';
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Envie um arquivo CSV' }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseLotesCsv(text);

  if (action === 'preview') {
    return NextResponse.json({
      ok: true,
      type: 'lotes',
      fileName: file.name,
      total: parsed.rows.length,
      validCount: parsed.validCount,
      errorCount: parsed.errorCount,
      soldOutCount: parsed.soldOutCount,
      rows: parsed.rows,
    });
  }

  if (action !== 'import') {
    return NextResponse.json({ error: 'action inválida' }, { status: 400 });
  }

  const valid = parsed.rows.filter((r) => r._errors.length === 0);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let missingEvent = 0;
  const errors: { row: number; msg: string }[] = [];

  // ordem por evento
  const ordemByEvent = new Map<string, number>();

  for (const r of valid) {
    try {
      const event = await prisma.event.findFirst({
        where: {
          OR: [
            { slug: `woo-${r.event_external_id}` },
            { description: { contains: `[woo:event:${r.event_external_id}]` } },
          ],
        },
      });
      if (!event) {
        missingEvent += 1;
        errors.push({
          row: r._row,
          msg: `Evento ${r.event_external_id} não importado`,
        });
        continue;
      }

      const priceCents = moneyToCents(r.price);
      const capacity = Math.max(0, parseInt(r.capacity, 10) || 0);
      const stock = Math.max(0, parseInt(r.stock, 10) || 0);
      let sold = parseInt(r.sold, 10);
      if (!Number.isFinite(sold) || sold < 0) {
        sold = capacity > 0 ? Math.max(0, capacity - stock) : 0;
      }
      const soldOut =
        r.sold_out === '1' ||
        r.stock_status === 'outofstock' ||
        (capacity > 0 && sold >= capacity) ||
        (r.stock_status !== 'instock' && stock <= 0);

      const totalQty = capacity > 0 ? capacity : Math.max(sold, stock, 1);
      if (sold > totalQty) sold = totalQty;

      const tag = `[woo:product:${r.product_external_id}]`;
      const existingTt = await prisma.ticketType.findFirst({
        where: {
          eventId: event.id,
          description: { contains: tag },
        },
      });
      const existingLote = await prisma.lote.findFirst({
        where: {
          eventId: event.id,
          nome: { contains: r.product_external_id },
        },
      });

      if ((existingTt || existingLote) && !replace) {
        skipped += 1;
        continue;
      }

      const ordem = (ordemByEvent.get(event.id) || 0) + 1;
      ordemByEvent.set(event.id, ordem);

      const nome = r.nome.slice(0, 255);
      // nome do lote: tenta extrair "Lote X" do título
      const loteNome =
        nome.match(/Lote\s+[^\-–|]+/i)?.[0]?.trim() ||
        nome.slice(0, 80) ||
        `Lote ${r.product_external_id}`;

      if (existingTt && replace) {
        await prisma.ticketType.update({
          where: { id: existingTt.id },
          data: {
            name: nome,
            priceCents,
            totalQty,
            sold,
            description: `${tag} capacity=${capacity} stock=${stock} sold_out=${soldOut ? 1 : 0}`,
          },
        });
        if (existingLote) {
          await prisma.lote.update({
            where: { id: existingLote.id },
            data: {
              nome: `${loteNome} (#${r.product_external_id})`.slice(0, 255),
              precoCents: priceCents,
              totalQty,
              sold,
              ativo: !soldOut,
            },
          });
        }
        updated += 1;
        continue;
      }

      await prisma.ticketType.create({
        data: {
          eventId: event.id,
          name: nome,
          priceCents,
          totalQty,
          sold,
          description: `${tag} capacity=${capacity} stock=${stock} sold_out=${soldOut ? 1 : 0}`,
        },
      });

      await prisma.lote.create({
        data: {
          eventId: event.id,
          nome: `${loteNome} (#${r.product_external_id})`.slice(0, 255),
          precoCents: priceCents,
          totalQty,
          sold,
          ordem,
          viradaAutomatica: true,
          ativo: !soldOut,
        },
      });

      // se houver lote ativo e este não está esgotado, não força activeLote
      // (admin define depois)

      created += 1;
    } catch (e) {
      errors.push({ row: r._row, msg: (e as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    type: 'lotes',
    created,
    updated,
    skipped,
    missingEvent,
    errors: errors.slice(0, 80),
    errorCount: errors.length,
  });
}
