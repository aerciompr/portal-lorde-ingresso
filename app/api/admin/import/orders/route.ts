import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminMutation } from '@/lib/request-security';
import {
  mapOrderStatus,
  moneyToCents,
  parseOrdersCsv,
  type CsvOrderRow,
} from '@/lib/csv-woo-import';
import { generateUniqueCode } from '@/lib/utils';
import { signCode } from '@/lib/validate-ticket';

/**
 * POST multipart: file + action=preview|import + replace=0|1
 * Requer eventos já importados (event_external_id → Event com [woo:event:ID]).
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
  const parsed = parseOrdersCsv(text);

  if (action === 'preview') {
    // resolver quantos event_external_id batem com eventos no portal
    const eventExts = [
      ...new Set(
        parsed.rows
          .filter((r) => !r._errors.length && r.event_external_id)
          .map((r) => r.event_external_id)
      ),
    ];
    const matched: Record<string, string> = {};
    for (const ext of eventExts.slice(0, 500)) {
      const ev = await prisma.event.findFirst({
        where: {
          OR: [
            { slug: `woo-${ext}` },
            { description: { contains: `[woo:event:${ext}]` } },
          ],
        },
        select: { id: true, title: true },
      });
      if (ev) matched[ext] = ev.title;
    }

    return NextResponse.json({
      ok: true,
      type: 'orders',
      fileName: file.name,
      total: parsed.rows.length,
      validCount: parsed.validCount,
      errorCount: parsed.errorCount,
      orderCount: parsed.orderCount,
      eventsMatched: Object.keys(matched).length,
      eventsReferenced: eventExts.length,
      matchedSample: matched,
      rows: parsed.rows.slice(0, 500), // preview limitado na UI
      truncated: parsed.rows.length > 500,
    });
  }

  if (action !== 'import') {
    return NextResponse.json({ error: 'action inválida' }, { status: 400 });
  }

  const valid = parsed.rows.filter((r) => r._errors.length === 0);

  // Agrupar linhas por pedido
  const byOrder = new Map<string, CsvOrderRow[]>();
  for (const r of valid) {
    const list = byOrder.get(r.external_id) || [];
    list.push(r);
    byOrder.set(r.external_id, list);
  }

  // Cache eventos
  const eventCache = new Map<string, string>();
  async function resolveEventId(eventExt: string): Promise<string | null> {
    if (!eventExt) {
      // fallback
      if (eventCache.has('__orphan__')) return eventCache.get('__orphan__')!;
      let orphan = await prisma.event.findFirst({
        where: { slug: 'importado-woo-sem-evento' },
      });
      if (!orphan) {
        orphan = await prisma.event.create({
          data: {
            title: 'Importado Woo (sem evento)',
            slug: 'importado-woo-sem-evento',
            date: new Date('2020-01-01T23:00:00Z'),
            openTime: '20:00',
            description: 'Pedidos CSV sem event_external_id',
            address: 'Lorde Nelson Rest Pub — Maceió/AL',
          },
        });
      }
      eventCache.set('__orphan__', orphan.id);
      return orphan.id;
    }
    if (eventCache.has(eventExt)) return eventCache.get(eventExt)!;
    const ev = await prisma.event.findFirst({
      where: {
        OR: [
          { slug: `woo-${eventExt}` },
          { description: { contains: `[woo:event:${eventExt}]` } },
        ],
      },
    });
    if (!ev) return null;
    eventCache.set(eventExt, ev.id);
    return ev.id;
  }

  const ttCache = new Map<string, string>();
  async function resolveTicketType(
    eventId: string,
    name: string,
    priceCents: number,
    productExt: string
  ): Promise<string> {
    const key = `${eventId}:${productExt || name}:${priceCents}`;
    if (ttCache.has(key)) return ttCache.get(key)!;

    // Preferir lote/tipo já importado (CSV lotes) via tag [woo:product:ID]
    if (productExt) {
      const byProduct = await prisma.ticketType.findFirst({
        where: {
          eventId,
          description: { contains: `[woo:product:${productExt}]` },
        },
      });
      if (byProduct) {
        ttCache.set(key, byProduct.id);
        return byProduct.id;
      }
    }

    const existing = await prisma.ticketType.findFirst({
      where: {
        eventId,
        name: name.slice(0, 255),
        priceCents,
      },
    });
    if (existing) {
      ttCache.set(key, existing.id);
      return existing.id;
    }
    const tt = await prisma.ticketType.create({
      data: {
        eventId,
        name: name.slice(0, 255),
        priceCents,
        totalQty: 99999,
        sold: 0,
        description: productExt
          ? `[woo:product:${productExt}] Import CSV`
          : 'Import CSV',
      },
    });
    ttCache.set(key, tt.id);
    return tt.id;
  }

  let created = 0;
  let skipped = 0;
  let replaced = 0;
  const errors: { order: string; msg: string }[] = [];

  for (const [extOrderId, lines] of byOrder) {
    try {
      const existing = await prisma.order.findFirst({
        where: { source: 'woocommerce', externalId: extOrderId },
      });
      if (existing) {
        if (!replace) {
          skipped += 1;
          continue;
        }
        await prisma.ticket.deleteMany({ where: { orderId: existing.id } });
        await prisma.order.delete({ where: { id: existing.id } });
        replaced += 1;
      }

      const head = lines[0];
      const eventId = await resolveEventId(head.event_external_id);
      if (!eventId) {
        errors.push({
          order: extOrderId,
          msg: `Evento external_id=${head.event_external_id} não importado. Importe eventos.csv primeiro.`,
        });
        continue;
      }

      const status = mapOrderStatus(head.status);
      let totalCents = 0;
      for (const line of lines) {
        const q = Math.max(1, parseInt(line.qty, 10) || 1);
        totalCents += moneyToCents(line.price) * q;
      }
      if (totalCents <= 0) {
        // fallback: soma se price unitário zero
        totalCents = lines.reduce(
          (s, l) => s + moneyToCents(l.price) * Math.max(1, parseInt(l.qty, 10) || 1),
          0
        );
      }

      const paidAt = head.paid_at
        ? new Date(head.paid_at.replace(' ', 'T'))
        : head.created_at
          ? new Date(head.created_at.replace(' ', 'T'))
          : new Date();
      const createdAt = head.created_at
        ? new Date(head.created_at.replace(' ', 'T'))
        : paidAt;

      const accessCode =
        'LN-W' +
        Number(extOrderId).toString(36).toUpperCase().slice(-6) +
        Math.random().toString(36).slice(2, 4).toUpperCase();

      const order = await prisma.order.create({
        data: {
          eventId,
          buyerName: head.buyer_name.slice(0, 255),
          buyerEmail: head.buyer_email.slice(0, 255),
          buyerPhone: head.buyer_phone?.slice(0, 32) || null,
          buyerCpf: head.buyer_cpf?.slice(0, 32) || null,
          totalCents,
          grossCents: totalCents,
          netCents: totalCents,
          feeCents: 0,
          feeDetails: 'import csv woocommerce',
          status:
            status === 'refunded'
              ? 'refunded'
              : status === 'cancelled'
                ? 'cancelled'
                : 'paid',
          paymentGateway: 'woocommerce-legacy',
          paymentMethod: head.payment_method || 'legacy',
          paymentId: head.payment_id || null,
          accessCode: accessCode.slice(0, 64),
          paidAt: status === 'paid' || status === 'refunded' ? paidAt : null,
          createdAt: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(),
          source: 'woocommerce',
          externalId: extOrderId,
          allowClientCancel: false,
        },
      });

      for (const line of lines) {
        const q = Math.max(1, Math.min(50, parseInt(line.qty, 10) || 1));
        const unit = moneyToCents(line.price);
        const ttId = await resolveTicketType(
          eventId,
          line.ticket_name,
          unit,
          line.product_external_id
        );
        const ticketStatus =
          status === 'refunded' || status === 'cancelled' ? 'cancelled' : 'valid';

        for (let i = 0; i < q; i++) {
          let uniqueCode = generateUniqueCode('WC');
          for (let t = 0; t < 5; t++) {
            const clash = await prisma.ticket.findUnique({ where: { uniqueCode } });
            if (!clash) break;
            uniqueCode = generateUniqueCode('WC');
          }
          await prisma.ticket.create({
            data: {
              orderId: order.id,
              ticketTypeId: ttId,
              uniqueCode,
              qrPayload: signCode(uniqueCode),
              status: ticketStatus,
            },
          });
        }
        if (status === 'paid') {
          await prisma.ticketType.update({
            where: { id: ttId },
            data: { sold: { increment: q } },
          });
        }
      }

      created += 1;
    } catch (e) {
      errors.push({ order: extOrderId, msg: (e as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    type: 'orders',
    created,
    skipped,
    replaced,
    errors: errors.slice(0, 50),
    errorCount: errors.length,
  });
}
