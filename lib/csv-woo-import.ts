/**
 * Parse e normalização de CSV de migração WooCommerce.
 */

export type CsvEventRow = {
  external_id: string;
  title: string;
  slug: string;
  date: string;
  open_time: string;
  address: string;
  description: string;
  _row: number;
  _errors: string[];
};

export type CsvOrderRow = {
  external_id: string;
  event_external_id: string;
  ticket_name: string;
  price: string;
  qty: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  buyer_cpf: string;
  status: string;
  paid_at: string;
  created_at: string;
  payment_method: string;
  payment_id: string;
  product_external_id: string;
  _row: number;
  _errors: string[];
};

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

/** CSV simples com aspas opcionais */
export function parseCsv(text: string): string[][] {
  const raw = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const delim = detectDelimiter(lines[0]);
  const rows: string[][] = [];
  for (const line of lines) {
    rows.push(splitCsvLine(line, delim));
  }
  return rows;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '');
}

function rowToObj(headers: string[], cells: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  headers.forEach((h, i) => {
    o[h] = (cells[i] ?? '').trim();
  });
  return o;
}

export function parseEventsCsv(text: string): {
  rows: CsvEventRow[];
  headers: string[];
  validCount: number;
  errorCount: number;
} {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], headers: [], validCount: 0, errorCount: 0 };
  }
  const headers = table[0].map(normHeader);
  const rows: CsvEventRow[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let i = 1; i < table.length; i++) {
    const o = rowToObj(headers, table[i]);
    const external_id = o.external_id || o.id || o.post_id || '';
    const title = o.title || o.nome || o.post_title || '';
    const date = o.date || o.start_date || o.data || '';
    const errors: string[] = [];
    if (!external_id) errors.push('external_id vazio');
    if (!title) errors.push('title vazio');
    if (!date) errors.push('date vazio');
    else if (Number.isNaN(Date.parse(date.replace(' ', 'T')))) errors.push('date inválida');

    const row: CsvEventRow = {
      external_id,
      title,
      slug: o.slug || '',
      date,
      open_time: o.open_time || o.opentime || o.hora || '',
      address: o.address || o.endereco || 'Lorde Nelson Rest Pub — Maceió/AL',
      description: o.description || o.descricao || '',
      _row: i + 1,
      _errors: errors,
    };
    if (errors.length) errorCount += 1;
    else validCount += 1;
    rows.push(row);
  }
  return { rows, headers, validCount, errorCount };
}

export function parseOrdersCsv(text: string): {
  rows: CsvOrderRow[];
  headers: string[];
  validCount: number;
  errorCount: number;
  orderCount: number;
} {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], headers: [], validCount: 0, errorCount: 0, orderCount: 0 };
  }
  const headers = table[0].map(normHeader);
  const rows: CsvOrderRow[] = [];
  let validCount = 0;
  let errorCount = 0;
  const orderIds = new Set<string>();

  for (let i = 1; i < table.length; i++) {
    const o = rowToObj(headers, table[i]);
    const external_id = o.external_id || o.order_id || o.pedido || '';
    const ticket_name = o.ticket_name || o.product_name || o.ingresso || '';
    const qty = o.qty || o.quantity || o.qtd || '1';
    const buyer_email = (o.buyer_email || o.email || '').toLowerCase();
    const buyer_name = o.buyer_name || o.nome || o.cliente || '';
    const price = o.price || o.preco || o.unit_price || '0';
    const status = (o.status || 'completed').toLowerCase().replace(/^wc-/, '');
    const errors: string[] = [];
    if (!external_id) errors.push('external_id vazio');
    if (!ticket_name) errors.push('ticket_name vazio');
    if (!buyer_email || !buyer_email.includes('@')) errors.push('buyer_email inválido');
    if (!buyer_name) errors.push('buyer_name vazio');
    const qn = parseInt(qty, 10);
    if (!Number.isFinite(qn) || qn < 1) errors.push('qty inválida');
    if (!['completed', 'processing', 'paid', 'refunded', 'cancelled', 'canceled'].includes(status)) {
      errors.push(`status desconhecido: ${status}`);
    }

    const row: CsvOrderRow = {
      external_id,
      event_external_id: o.event_external_id || o.event_id || o.evento || '',
      ticket_name,
      price,
      qty: String(qn || 1),
      buyer_name,
      buyer_email,
      buyer_phone: o.buyer_phone || o.phone || o.telefone || '',
      buyer_cpf: o.buyer_cpf || o.cpf || '',
      status,
      paid_at: o.paid_at || o.date_paid || '',
      created_at: o.created_at || o.date_created || '',
      payment_method: o.payment_method || '',
      payment_id: o.payment_id || '',
      product_external_id: o.product_external_id || o.product_id || '',
      _row: i + 1,
      _errors: errors,
    };
    if (errors.length) errorCount += 1;
    else {
      validCount += 1;
      orderIds.add(external_id);
    }
    rows.push(row);
  }
  return { rows, headers, validCount, errorCount, orderCount: orderIds.size };
}

export function moneyToCents(v: string): number {
  let s = String(v || '0').trim().replace(/[R$\s]/gi, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.abs(n) * 100);
}

export function mapOrderStatus(status: string): 'paid' | 'refunded' | 'cancelled' {
  const s = status.toLowerCase().replace(/^wc-/, '');
  if (s === 'refunded') return 'refunded';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'paid';
}

export function slugify(s: string): string {
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
