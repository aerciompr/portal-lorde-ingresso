export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

/** Status de pedido (banco em inglês → UI em português) */
export function orderStatusLabel(status: string | null | undefined): string {
  const s = (status || '').toLowerCase();
  const map: Record<string, string> = {
    paid: 'Pago',
    pending: 'Pendente',
    refunded: 'Estornado',
    cancelled: 'Cancelado',
    canceled: 'Cancelado',
  };
  return map[s] || status || '—';
}

/** Status de ingresso */
export function ticketStatusLabel(status: string | null | undefined): string {
  const s = (status || '').toLowerCase();
  const map: Record<string, string> = {
    valid: 'Válido',
    used: 'Utilizado',
    cancelled: 'Cancelado',
    canceled: 'Cancelado',
  };
  return map[s] || status || '—';
}

/** Status de solicitação de cancelamento */
export function cancellationStatusLabel(status: string | null | undefined): string {
  const s = (status || '').toLowerCase();
  const map: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Recusado',
  };
  return map[s] || status || '—';
}

/** Método de pagamento (exibição) */
export function paymentMethodLabel(method: string | null | undefined): string {
  const s = (method || '').toLowerCase();
  const map: Record<string, string> = {
    pix: 'PIX',
    card: 'Cartão',
    credit_card: 'Cartão',
    boleto: 'Boleto',
    manual: 'Manual',
    courtesy: 'Cortesia',
  };
  return map[s] || method || '—';
}

/** Aviso legal padrão exibido ao final da descrição de todo evento (quando footerNotice estiver vazio). */
export const DEFAULT_EVENT_FOOTER_NOTICE =
  'Proibido para menores de 18 anos. Os ingressos são vendidos até a data limite ou enquanto durarem os estoques.';

/** Retorna o aviso do evento ou o texto padrão do sistema. */
export function getEventFooterNotice(custom?: string | null): string {
  const t = (custom || '').trim();
  return t || DEFAULT_EVENT_FOOTER_NOTICE;
}

/**
 * Formata centavos no padrão brasileiro: R$ 1.234,56
 * Use em toda a UI (site + admin) em vez de "R$ " + toFixed(2).
 */
export function formatPrice(cents: number): string {
  const value = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formata valor já em reais (number) → R$ 35,00 */
export function formatBRL(reais: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(reais) || 0);
}

/**
 * Centavos → string para input no padrão BR: "35,00" / "1.234,50"
 */
export function centsToInput(cents: number): string {
  return ((Number(cents) || 0) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Converte digitação brasileira/americana em centavos.
 * Aceita: "35", "35,00", "35.00", "1.234,56", "R$ 35,00"
 */
export function parseBRLToCents(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }
  let s = String(value ?? '')
    .trim()
    .replace(/[R$\s\u00a0]/gi, '');
  if (!s) return 0;

  // 1.234,56 (BR) → remove milhares, vírgula vira ponto
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Reais digitados → number (para cálculos). Aceita vírgula. */
export function parseBRLToNumber(value: string | number | null | undefined): number {
  return parseBRLToCents(value) / 100;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function generateUniqueCode(prefix = 'LN'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${code}`;
}

export function isPastDeadline(event: { salesDeadline?: Date | string | null; date: Date | string }): boolean {
  const now = new Date();
  if (event.salesDeadline) {
    return now > new Date(event.salesDeadline);
  }
  return now > new Date(event.date);
}
