'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatPrice, ticketStatusLabel } from '@/lib/utils';
import StatusBadge from '@/components/StatusBadge';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  Mail,
  CreditCard,
  User,
  Ticket,
  Loader2,
} from 'lucide-react';

type TimelineItem = {
  at: string;
  kind: string;
  title: string;
  detail?: string;
};

type OrderDetail = {
  id: string;
  buyerName: string;
  buyerEmail: string;
  buyerCpf?: string | null;
  buyerPhone?: string | null;
  buyerZip?: string | null;
  buyerStreet?: string | null;
  buyerNumber?: string | null;
  buyerCity?: string | null;
  buyerState?: string | null;
  totalCents: number;
  discountCents?: number;
  promoCodeLabel?: string | null;
  grossCents?: number;
  netCents?: number;
  feeCents?: number;
  feeDetails?: string | null;
  status: string;
  accessCode?: string | null;
  paymentMethod?: string | null;
  paymentGateway?: string | null;
  paymentId?: string | null;
  source?: string | null;
  createdAt: string;
  paidAt?: string | null;
  emailSentAt?: string | null;
  event: {
    id: string;
    title: string;
    slug: string;
    date: string;
    openTime?: string | null;
    address?: string;
  };
  lote?: { id: string; nome: string; precoCents: number } | null;
  tickets: Array<{
    id: string;
    uniqueCode: string;
    status: string;
    ticketType?: { name: string; priceCents?: number };
  }>;
  ticketsActive?: number;
  ticketsCancelled?: number;
};

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

const kindColor: Record<string, string> = {
  created: 'bg-zinc-500',
  payment_setup: 'bg-sky-500',
  pay_start: 'bg-sky-500',
  pay_ok: 'bg-sky-400',
  pay_error: 'bg-red-500',
  client_error: 'bg-red-600',
  paid: 'bg-emerald-500',
  email: 'bg-emerald-400',
  email_fail: 'bg-red-400',
  email_unknown: 'bg-zinc-600',
  email_migration: 'bg-violet-500',
  cancelled: 'bg-amber-500',
  refunded: 'bg-red-500',
  cancel_request: 'bg-orange-500',
  cancel_processed: 'bg-orange-400',
  note: 'bg-zinc-400',
  sync: 'bg-indigo-500',
};

export default function AdminPedidoDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pedido não encontrado');
      setOrder(data.order);
      setTimeline(data.timeline || []);
    } catch (e) {
      toast.error((e as Error).message);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function downloadPdf(ticketId: string, code: string) {
    setDownloadingId(ticketId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/pdf`);
      if (!res.ok) throw new Error('Falha no PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ingresso-${code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-zinc-400 flex items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando pedido…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 text-center">
        <p className="text-zinc-400 mb-4">Pedido não encontrado</p>
        <Link href="/admin/pedidos" className="btn btn-secondary text-sm">
          Voltar
        </Link>
      </div>
    );
  }

  const addr = [
    order.buyerStreet,
    order.buyerNumber,
    order.buyerCity,
    order.buyerState,
    order.buyerZip,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="max-w-4xl mx-auto w-full min-w-0 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <Link
            href="/admin/pedidos"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Pedidos
          </Link>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Pedido #{order.id.slice(0, 10)}…
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            {order.source && (
              <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-white/5 text-zinc-500">
                {order.source}
              </span>
            )}
            {order.accessCode && (
              <code className="text-xs bg-zinc-900 px-2 py-1 rounded border border-white/10">
                {order.accessCode}
              </code>
            )}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Cliente
          </div>
          <div className="font-medium">{order.buyerName || '—'}</div>
          <div className="text-sm text-zinc-400">{order.buyerEmail || '—'}</div>
          {order.buyerPhone && (
            <div className="text-sm text-zinc-500">Tel: {order.buyerPhone}</div>
          )}
          {order.buyerCpf && (
            <div className="text-sm text-zinc-500">CPF: {order.buyerCpf}</div>
          )}
          {addr && <div className="text-xs text-zinc-500 pt-1">{addr}</div>}
        </div>

        <div className="card p-4 space-y-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Evento
          </div>
          <div className="font-medium">{order.event.title}</div>
          <div className="text-sm text-zinc-400">
            {fmt(order.event.date)}
            {order.event.openTime ? ` · abre ${order.event.openTime}` : ''}
          </div>
          <div className="text-xs text-zinc-500">{order.event.address}</div>
          {order.lote && (
            <div className="text-sm text-emerald-400/90">Lote: {order.lote.nome}</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3">
          <div className="text-[10px] text-zinc-500 uppercase">Bruto</div>
          <div className="font-semibold tabular-nums">
            {formatPrice(order.grossCents || order.totalCents)}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-[10px] text-zinc-500 uppercase">Líquido</div>
          <div
            className={`font-semibold tabular-nums ${
              (order.netCents ?? 0) < 0 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {formatPrice(order.netCents ?? 0)}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-[10px] text-zinc-500 uppercase">Taxa</div>
          <div className="font-semibold tabular-nums">
            {formatPrice(order.feeCents ?? 0)}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
            <CreditCard className="w-3 h-3" /> Pagamento
          </div>
          <div className="text-sm truncate">
            {order.paymentGateway || '—'} / {order.paymentMethod || '—'}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card p-5">
        <div className="font-medium mb-1 flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          Histórico do pedido
        </div>
        <p className="text-[11px] text-zinc-500 mb-4">
          Inclui tentativas de pagamento, recusa de cartão, erros de gateway e e-mails.
        </p>
        <ol className="relative border-l border-white/10 ml-2 space-y-5">
          {timeline.map((item, i) => (
            <li key={`${item.kind}-${i}`} className="ml-4">
              <span
                className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ring-4 ring-zinc-950 ${
                  kindColor[item.kind] || 'bg-zinc-500'
                }`}
              />
              <div className="text-[11px] text-zinc-500 tabular-nums">{fmt(item.at)}</div>
              <div className="text-sm font-medium text-zinc-100">{item.title}</div>
              {item.detail && (
                <div className="text-xs text-zinc-500 mt-0.5 break-words">{item.detail}</div>
              )}
            </li>
          ))}
        </ol>
        {timeline.length === 0 && (
          <p className="text-sm text-zinc-500">Sem eventos registrados.</p>
        )}
        <div className="mt-4 pt-3 border-t border-white/5 grid sm:grid-cols-3 gap-2 text-xs text-zinc-500">
          <div>
            <span className="text-zinc-600">Criado:</span> {fmt(order.createdAt)}
          </div>
          <div>
            <span className="text-zinc-600">Pago:</span> {fmt(order.paidAt)}
          </div>
          <div>
            <span className="text-zinc-600">E-mail:</span> {fmt(order.emailSentAt)}
          </div>
        </div>
      </div>

      {/* Tickets */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 text-sm">
          <Ticket className="w-4 h-4 text-emerald-400" />
          Ingressos ({order.tickets?.length || 0})
          {order.ticketsCancelled ? (
            <span className="text-xs text-zinc-500">
              · {order.ticketsCancelled} cancelado(s)
            </span>
          ) : null}
        </div>
        <div className="divide-y divide-white/5">
          {(order.tickets || []).map((t) => (
            <div
              key={t.id}
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div>
                <div className="font-mono text-sm">{t.uniqueCode}</div>
                <div className="text-xs text-zinc-500">
                  {t.ticketType?.name || '—'} · {ticketStatusLabel(t.status)}
                </div>
              </div>
              {t.status !== 'cancelled' && order.status === 'paid' && (
                <button
                  type="button"
                  className="btn btn-secondary text-xs inline-flex items-center gap-1"
                  disabled={downloadingId === t.id}
                  onClick={() => downloadPdf(t.id, t.uniqueCode)}
                >
                  {downloadingId === t.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  PDF
                </button>
              )}
            </div>
          ))}
          {(!order.tickets || order.tickets.length === 0) && (
            <div className="p-6 text-center text-zinc-500 text-sm">Sem ingressos</div>
          )}
        </div>
      </div>

      {order.paymentId && (
        <div className="text-xs text-zinc-600 break-all">
          Payment ID: <code className="text-zinc-400">{order.paymentId}</code>
        </div>
      )}
      {(order.discountCents || 0) > 0 && (
        <div className="text-xs text-emerald-400/90">
          Cupom{order.promoCodeLabel ? ` ${order.promoCodeLabel}` : ''}: −
          {formatPrice(order.discountCents || 0)}
        </div>
      )}
      {order.feeDetails && (
        <div className="text-xs text-zinc-600 break-words">
          Notas: <span className="text-zinc-400">{order.feeDetails}</span>
        </div>
      )}
    </div>
  );
}
