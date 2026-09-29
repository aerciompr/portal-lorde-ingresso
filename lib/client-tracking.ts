'use client';

type TrackingPayload = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

function money(cents: number) {
  return Math.max(0, Number(cents) || 0) / 100;
}

function emit(name: string, payload: TrackingPayload, metaName: string) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...payload });
  window.gtag?.('event', name, payload);
  window.fbq?.('track', metaName, payload, payload.event_id ? { eventID: payload.event_id } : undefined);
}

export function trackViewItem(input: { eventId: string; title: string; valueCents: number }) {
  emit('view_item', {
    content_ids: [input.eventId], content_type: 'product', content_name: input.title,
    currency: 'BRL', value: money(input.valueCents),
  }, 'ViewContent');
}

export function trackBeginCheckout(input: { orderId: string; eventId: string; title: string; valueCents: number; quantity: number }) {
  emit('begin_checkout', {
    event_id: `checkout-${input.orderId}`, transaction_id: input.orderId,
    content_ids: [input.eventId], content_type: 'product', content_name: input.title,
    currency: 'BRL', value: money(input.valueCents), num_items: input.quantity,
    items: [{ item_id: input.eventId, item_name: input.title, price: money(input.valueCents) / Math.max(1, input.quantity), quantity: input.quantity }],
  }, 'InitiateCheckout');
}

export function trackAddPaymentInfo(input: { orderId: string; eventId: string; title: string; valueCents: number; method: string }) {
  emit('add_payment_info', {
    event_id: `payment-${input.orderId}-${input.method}`, transaction_id: input.orderId,
    content_ids: [input.eventId], content_type: 'product', content_name: input.title,
    currency: 'BRL', value: money(input.valueCents), payment_type: input.method,
  }, 'AddPaymentInfo');
}

/** Uma conversão por pedido e navegador; o status pago já foi confirmado pela API. */
export function trackPurchaseOnce(input: { orderId: string; eventId: string; title: string; valueCents: number; quantity: number }) {
  if (typeof window === 'undefined') return;
  const key = `ln-purchase-tracked-${input.orderId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // sem storage ainda dispara; plataformas possuem transaction_id/event_id para deduplicar
  }
  emit('purchase', {
    event_id: input.orderId, transaction_id: input.orderId,
    content_ids: [input.eventId], content_type: 'product', content_name: input.title,
    currency: 'BRL', value: money(input.valueCents), num_items: input.quantity,
    items: [{ item_id: input.eventId, item_name: input.title, price: money(input.valueCents) / Math.max(1, input.quantity), quantity: input.quantity }],
  }, 'Purchase');
}
