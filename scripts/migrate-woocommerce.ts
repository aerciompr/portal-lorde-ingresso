/**
 * Migra pedidos WooCommerce + Event Tickets (Tribe) → portal.
 *
 * Pré-requisitos:
 * - Dump importado em MySQL separado (ex. wp_legacy)
 * - WP_DATABASE_URL=mysql://...@127.0.0.1:3306/wp_legacy
 * - DATABASE_URL=banco do portal
 * - npx prisma db push (campos source, externalId, allowClientCancel)
 *
 * Uso:
 *   npx tsx scripts/migrate-woocommerce.ts --dry-run
 *   npx tsx scripts/migrate-woocommerce.ts --limit=20
 *   npx tsx scripts/migrate-woocommerce.ts --since=2024-01-01
 *   npx tsx scripts/migrate-woocommerce.ts --force
 */

import mysql from 'mysql2/promise';
import { PrismaClient } from '@prisma/client';
import { generateUniqueCode } from '../lib/utils';
import { signCode } from '../lib/validate-ticket';

const prisma = new PrismaClient();

type Args = {
  dryRun: boolean;
  limit: number | null;
  since: string | null;
  force: boolean;
};

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const dryRun = a.includes('--dry-run');
  const force = a.includes('--force');
  let limit: number | null = null;
  let since: string | null = null;
  for (const x of a) {
    if (x.startsWith('--limit=')) limit = parseInt(x.split('=')[1], 10) || null;
    if (x.startsWith('--since=')) since = x.split('=')[1] || null;
  }
  return { dryRun, limit, since, force };
}

function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'evento'
  );
}

function moneyToCents(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.abs(n) * 100);
}

function mapStatus(wc: string): 'paid' | 'refunded' | 'cancelled' | 'pending' {
  const s = (wc || '').replace(/^wc-/, '').toLowerCase();
  if (['completed', 'processing'].includes(s)) return 'paid';
  if (['refunded'].includes(s)) return 'refunded';
  if (['cancelled', 'canceled', 'failed', 'trash'].includes(s)) return 'cancelled';
  return 'pending';
}

async function main() {
  const args = parseArgs();
  const wpUrl = process.env.WP_DATABASE_URL || '';
  if (!wpUrl) {
    console.error(
      'Defina WP_DATABASE_URL (MySQL com o dump Woo). Ex.: mysql://root:pass@127.0.0.1:3306/wp_legacy'
    );
    process.exit(1);
  }

  console.log('Conectando WP…', wpUrl.replace(/:[^:@/]+@/, ':***@'));
  const wp = await mysql.createConnection(wpUrl);

  // Detecta prefixo de tabela
  const [tables] = await wp.query<mysql.RowDataPacket[]>('SHOW TABLES');
  const tableNames = tables.map((r) => Object.values(r)[0] as string);
  const prefix =
    tableNames.find((t) => t.endsWith('wc_order_stats'))?.replace(/wc_order_stats$/, '') ||
    'wp_';
  console.log('Prefixo de tabelas:', prefix);

  const T = {
    stats: `${prefix}wc_order_stats`,
    products: `${prefix}wc_order_product_lookup`,
    customers: `${prefix}wc_customer_lookup`,
    addresses: `${prefix}wc_order_addresses`,
    posts: `${prefix}posts`,
    postmeta: `${prefix}postmeta`,
    tec: `${prefix}tec_events`,
  };

  // --- Eventos TEC ---
  const [tecRows] = await wp.query<mysql.RowDataPacket[]>(
    `SELECT e.post_id, e.start_date, e.end_date, p.post_title, p.post_name
     FROM \`${T.tec}\` e
     LEFT JOIN \`${T.posts}\` p ON p.ID = e.post_id`
  );
  console.log(`Eventos TEC: ${tecRows.length}`);

  // product_id → event post_id (Tribe)
  const [ticketMeta] = await wp.query<mysql.RowDataPacket[]>(
    `SELECT post_id AS product_id, meta_value AS event_post_id
     FROM \`${T.postmeta}\`
     WHERE meta_key = '_tribe_wooticket_for_event' AND meta_value REGEXP '^[0-9]+$'`
  );
  const productToEvent = new Map<number, number>();
  for (const r of ticketMeta) {
    productToEvent.set(Number(r.product_id), Number(r.event_post_id));
  }
  console.log(`Produtos-ticket com evento: ${productToEvent.size}`);

  // product titles + prices
  const [products] = await wp.query<mysql.RowDataPacket[]>(
    `SELECT p.ID, p.post_title,
       (SELECT meta_value FROM \`${T.postmeta}\` m WHERE m.post_id = p.ID AND m.meta_key = '_price' LIMIT 1) AS price
     FROM \`${T.posts}\` p
     WHERE p.post_type = 'product' AND p.post_status IN ('publish','private','draft')`
  );
  const productInfo = new Map<number, { title: string; priceCents: number }>();
  for (const p of products) {
    productInfo.set(Number(p.ID), {
      title: String(p.post_title || 'Ingresso'),
      priceCents: moneyToCents(p.price),
    });
  }

  // Pedidos
  let sql = `
    SELECT s.order_id, s.status, s.total_sales, s.net_total, s.num_items_sold,
           s.date_created, s.date_paid, s.customer_id
    FROM \`${T.stats}\` s
    WHERE s.parent_id = 0
      AND s.status IN ('wc-completed','wc-processing','wc-refunded','wc-cancelled','wc-canceled')
  `;
  const params: (string | number)[] = [];
  if (args.since) {
    sql += ` AND s.date_created >= ?`;
    params.push(args.since);
  }
  sql += ` ORDER BY s.date_created ASC`;
  if (args.limit) {
    sql += ` LIMIT ${Math.max(1, args.limit)}`;
  }

  const [orders] = await wp.query<mysql.RowDataPacket[]>(sql, params);
  console.log(`Pedidos a processar: ${orders.length}${args.dryRun ? ' (dry-run)' : ''}`);

  // Billing meta em lote (só se precisarmos — por pedido no loop é ok com limit)

  let createdOrders = 0;
  let skipped = 0;
  let errors = 0;

  // Cache eventos portal: eventPostId → portal Event.id
  const eventCache = new Map<number, string>();
  const ticketTypeCache = new Map<string, string>(); // `${eventId}:${productId}` → ticketTypeId

  async function ensureEvent(eventPostId: number | null): Promise<string> {
    if (eventPostId && eventCache.has(eventPostId)) return eventCache.get(eventPostId)!;

    if (eventPostId) {
      const tec = tecRows.find((r) => Number(r.post_id) === eventPostId);
      const title = String(tec?.post_title || `Evento WP #${eventPostId}`);
      const slugBase = slugify(String(tec?.post_name || title));
      const dateStr = tec?.start_date || '2020-01-01 20:00:00';
      const date = new Date(dateStr.replace(' ', 'T') + '-03:00');
      const openTime = dateStr.slice(11, 16) || '20:00';

      if (args.dryRun) {
        const fake = `dry-event-${eventPostId}`;
        eventCache.set(eventPostId, fake);
        return fake;
      }

      let slug = slugBase;
      let n = 0;
      while (await prisma.event.findUnique({ where: { slug } })) {
        n += 1;
        slug = `${slugBase}-${n}`;
      }

      const ev = await prisma.event.create({
        data: {
          title: title.slice(0, 500),
          slug,
          date: Number.isFinite(date.getTime()) ? date : new Date('2020-01-01T23:00:00Z'),
          openTime,
          description: `Importado do WooCommerce (post ${eventPostId})`,
          address: 'Lorde Nelson Rest Pub — Maceió/AL',
          allowCancel: true,
        },
      });
      eventCache.set(eventPostId, ev.id);
      return ev.id;
    }

    // fallback evento
    const key = 0;
    if (eventCache.has(key)) return eventCache.get(key)!;
    if (args.dryRun) {
      eventCache.set(key, 'dry-event-orphan');
      return 'dry-event-orphan';
    }
    const existing = await prisma.event.findFirst({
      where: { slug: 'importado-woo-sem-evento' },
    });
    if (existing) {
      eventCache.set(key, existing.id);
      return existing.id;
    }
    const ev = await prisma.event.create({
      data: {
        title: 'Importado Woo (sem evento)',
        slug: 'importado-woo-sem-evento',
        date: new Date('2020-01-01T23:00:00Z'),
        openTime: '20:00',
        description: 'Pedidos Woo sem vínculo Tribe Event Tickets',
        address: 'Lorde Nelson Rest Pub — Maceió/AL',
      },
    });
    eventCache.set(key, ev.id);
    return ev.id;
  }

  async function ensureTicketType(
    eventId: string,
    productId: number
  ): Promise<{ id: string; priceCents: number; name: string }> {
    const cacheKey = `${eventId}:${productId}`;
    const info = productInfo.get(productId) || {
      title: `Produto #${productId}`,
      priceCents: 0,
    };
    if (ticketTypeCache.has(cacheKey)) {
      return {
        id: ticketTypeCache.get(cacheKey)!,
        priceCents: info.priceCents,
        name: info.title,
      };
    }
    if (args.dryRun) {
      const fake = `dry-tt-${productId}`;
      ticketTypeCache.set(cacheKey, fake);
      return { id: fake, priceCents: info.priceCents, name: info.title };
    }
    const tt = await prisma.ticketType.create({
      data: {
        eventId,
        name: info.title.slice(0, 255),
        priceCents: info.priceCents || 0,
        totalQty: 99999,
        sold: 0,
        description: `Woo product #${productId}`,
      },
    });
    ticketTypeCache.set(cacheKey, tt.id);
    return { id: tt.id, priceCents: info.priceCents, name: info.title };
  }

  for (const o of orders) {
    const orderId = Number(o.order_id);
    const status = mapStatus(String(o.status));
    if (status === 'pending') {
      skipped += 1;
      continue;
    }

    try {
      // Já importado?
      if (!args.dryRun) {
        const existing = await prisma.order.findFirst({
          where: { source: 'woocommerce', externalId: String(orderId) },
        });
        if (existing) {
          if (!args.force) {
            skipped += 1;
            continue;
          }
          await prisma.ticket.deleteMany({ where: { orderId: existing.id } });
          await prisma.order.delete({ where: { id: existing.id } });
        }
      }

      // Linhas do pedido
      const [lines] = await wp.query<mysql.RowDataPacket[]>(
        `SELECT product_id, variation_id, product_qty, product_gross_revenue, product_net_revenue
         FROM \`${T.products}\`
         WHERE order_id = ? AND product_qty > 0`,
        [orderId]
      );

      if (!lines.length) {
        skipped += 1;
        continue;
      }

      // Comprador
      const [billing] = await wp.query<mysql.RowDataPacket[]>(
        `SELECT meta_key, meta_value FROM \`${T.postmeta}\`
         WHERE post_id = ? AND meta_key IN (
           '_billing_email','_billing_first_name','_billing_last_name',
           '_billing_phone','_billing_cpf','_billing_persontype',
           '_payment_method','_stripe_intent_id','_transaction_id',
           '_Mercado_Pago_Payment_IDs'
         )`,
        [orderId]
      );
      const meta: Record<string, string> = {};
      for (const m of billing) meta[String(m.meta_key)] = String(m.meta_value ?? '');

      let email = (meta._billing_email || '').trim().toLowerCase();
      if (!email && o.customer_id) {
        const [cust] = await wp.query<mysql.RowDataPacket[]>(
          `SELECT email FROM \`${T.customers}\` WHERE customer_id = ? LIMIT 1`,
          [o.customer_id]
        );
        email = String(cust[0]?.email || '').toLowerCase();
      }
      if (!email) email = `woo-order-${orderId}@import.local`;

      const name =
        [meta._billing_first_name, meta._billing_last_name].filter(Boolean).join(' ').trim() ||
        `Cliente Woo #${orderId}`;
      const phone = meta._billing_phone || null;
      const cpf = meta._billing_cpf || null;

      // Evento principal = primeiro produto com tribe event
      let eventPostId: number | null = null;
      for (const line of lines) {
        const pid = Number(line.product_id);
        if (productToEvent.has(pid)) {
          eventPostId = productToEvent.get(pid)!;
          break;
        }
      }
      const eventId = await ensureEvent(eventPostId);

      const totalCents = moneyToCents(o.total_sales || o.net_total);
      const paidAt =
        o.date_paid && String(o.date_paid) !== '0000-00-00 00:00:00'
          ? new Date(o.date_paid)
          : o.date_created
            ? new Date(o.date_created)
            : new Date();

      let paymentGateway = 'woocommerce-legacy';
      let paymentId: string | null = null;
      if (meta._stripe_intent_id) {
        paymentGateway = 'woocommerce-stripe';
        paymentId = meta._stripe_intent_id;
      } else if (meta._Mercado_Pago_Payment_IDs) {
        paymentGateway = 'woocommerce-mercadopago';
        paymentId = meta._Mercado_Pago_Payment_IDs.split(',')[0]?.trim() || null;
      } else if (meta._transaction_id) {
        paymentId = meta._transaction_id;
      }

      const accessCode =
        'LN-W' +
        orderId.toString(36).toUpperCase().slice(-6) +
        Math.random().toString(36).slice(2, 4).toUpperCase();

      if (args.dryRun) {
        console.log(
          `[dry] order ${orderId} → ${status} ${email} R$${(totalCents / 100).toFixed(2)} lines=${lines.length} eventPost=${eventPostId ?? '—'}`
        );
        createdOrders += 1;
        continue;
      }

      const order = await prisma.order.create({
        data: {
          eventId,
          buyerName: name.slice(0, 255),
          buyerEmail: email.slice(0, 255),
          buyerPhone: phone?.slice(0, 32) || null,
          buyerCpf: cpf?.slice(0, 32) || null,
          totalCents,
          grossCents: totalCents,
          netCents: totalCents,
          feeCents: 0,
          feeDetails: 'importado woocommerce',
          status: status === 'refunded' ? 'refunded' : status === 'cancelled' ? 'cancelled' : 'paid',
          paymentGateway,
          paymentMethod: meta._payment_method || 'legacy',
          paymentId,
          accessCode: accessCode.slice(0, 64),
          paidAt: status === 'paid' || status === 'refunded' ? paidAt : null,
          createdAt: o.date_created ? new Date(o.date_created) : new Date(),
          source: 'woocommerce',
          externalId: String(orderId),
          allowClientCancel: false,
        },
      });

      // Tickets
      for (const line of lines) {
        const pid = Number(line.product_id);
        const qty = Math.max(1, Math.min(50, Number(line.product_qty) || 1));
        const tt = await ensureTicketType(eventId, pid);
        const unitCents =
          qty > 0
            ? Math.round(moneyToCents(line.product_gross_revenue || line.product_net_revenue) / qty)
            : tt.priceCents;

        for (let i = 0; i < qty; i++) {
          let uniqueCode = generateUniqueCode('WC');
          // garantir unicidade
          for (let t = 0; t < 5; t++) {
            const clash = await prisma.ticket.findUnique({ where: { uniqueCode } });
            if (!clash) break;
            uniqueCode = generateUniqueCode('WC');
          }
          const ticketStatus =
            status === 'refunded' || status === 'cancelled' ? 'cancelled' : 'valid';
          await prisma.ticket.create({
            data: {
              orderId: order.id,
              ticketTypeId: tt.id,
              uniqueCode,
              qrPayload: signCode(uniqueCode),
              status: ticketStatus,
            },
          });
        }

        // sold count
        if (status === 'paid') {
          await prisma.ticketType.update({
            where: { id: tt.id },
            data: { sold: { increment: qty } },
          });
        }
        void unitCents;
      }

      createdOrders += 1;
      if (createdOrders % 25 === 0) {
        console.log(`… ${createdOrders} pedidos importados`);
      }
    } catch (e) {
      errors += 1;
      console.error(`Erro order ${orderId}:`, (e as Error).message);
    }
  }

  await wp.end();
  await prisma.$disconnect();

  console.log('\n=== Resumo ===');
  console.log({
    dryRun: args.dryRun,
    createdOrders,
    skipped,
    errors,
    eventsCached: eventCache.size,
  });
  console.log(
    args.dryRun
      ? 'Dry-run ok. Rode sem --dry-run para gravar.'
      : 'Migração concluída. Teste Meus Ingressos e check-in localmente.'
  );
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
