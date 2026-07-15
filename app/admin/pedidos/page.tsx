'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { formatPrice, ticketStatusLabel } from '@/lib/utils';
import { toast } from 'sonner';
import { Download, FileText, Mail, KeyRound, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';

interface TicketRow {
  id: string;
  uniqueCode: string;
  status: string;
  ticketType?: { name: string };
}

interface Order {
  id: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  status: string;
  accessCode?: string | null;
  paymentMethod?: string;
  paymentGateway?: string;
  grossCents?: number;
  netCents?: number;
  feeCents?: number;
  feeDetails?: string | null;
  event: { title: string };
  lote?: { nome: string } | null;
  tickets?: TicketRow[];
}

type ResendMode = 'confirmation' | 'access_code' | 'both';

export default function AdminPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'refunded' | 'pending' | 'cancelled'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [syncingStripe, setSyncingStripe] = useState(false);
  const [runningCrons, setRunningCrons] = useState(false);
  const [recalcStock, setRecalcStock] = useState(false);
  const limit = 50;

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/orders?page=${page}&limit=${limit}&paged=1`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) {
      setOrders(data);
      setTotalPages(1);
      setTotal(data.length);
    } else {
      setOrders(data.orders || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      (o.buyerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.buyerEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.event.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function refund(orderId: string) {
    if (!confirm('Confirmar estorno real via gateway?')) return;
    const res = await fetch('/api/admin/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success('Estorno processado');
      load();
    } else toast.error(data.error);
  }

  async function downloadTicketPdf(ticketId: string, code: string) {
    setDownloadingId(ticketId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/pdf`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Falha ao baixar PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ingresso-${code}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('PDF baixado');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Erro no download');
    } finally {
      setDownloadingId(null);
    }
  }

  async function downloadAllOrderPdfs(order: Order) {
    const tickets = (order.tickets || []).filter((t) => t.status !== 'cancelled');
    if (tickets.length === 0) {
      toast.error('Nenhum ingresso para baixar neste pedido');
      return;
    }
    for (const t of tickets) {
      await downloadTicketPdf(t.id, t.uniqueCode);
    }
  }

  async function resendEmail(order: Order, mode: ResendMode) {
    if (!order.buyerEmail?.includes('@')) {
      toast.error('Pedido sem e-mail válido');
      return;
    }
    const labels: Record<ResendMode, string> = {
      confirmation: 'confirmação com PDF dos ingressos',
      access_code: 'código de acesso LN',
      both: 'confirmação + código LN',
    };
    if (
      !confirm(
        `Reenviar e-mail de ${labels[mode]} para\n${order.buyerEmail}\n\nPedido: ${order.event.title}`
      )
    ) {
      return;
    }
    setResendingId(`${order.id}:${mode}`);
    try {
      const res = await fetch('/api/admin/orders/resend-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Falha ao reenviar');
        return;
      }
      if (data.partial) {
        toast.warning(data.message || 'Reenvio parcial — confira logs');
      } else {
        toast.success(data.message || `E-mail enviado para ${order.buyerEmail}`);
      }
    } catch {
      toast.error('Erro de rede ao reenviar e-mail');
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Busque, reenvie e-mails, baixe PDFs e faça estornos.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mb-4">
        <input
          className="input w-full sm:max-w-xs min-w-0"
          placeholder="Buscar nome, e-mail ou evento..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="input w-full sm:w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="all">Todos os status</option>
          <option value="paid">Pagos</option>
          <option value="refunded">Estornados</option>
          <option value="pending">Pendentes</option>
          <option value="cancelled">Cancelados</option>
        </select>
        <button
          type="button"
          disabled={syncingStripe}
          className="btn btn-secondary text-sm disabled:opacity-50"
          title="Consulta Stripe: pagos, cancelados e taxas reais (líquido)"
          onClick={async () => {
            setSyncingStripe(true);
            try {
              const res = await fetch('/api/admin/orders/sync-stripe', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Falha');
              toast.success(
                data.message ||
                  `OK: ${data.finalized ?? 0} pagos · ${data.cancelled ?? 0} cancel. · ${data.feesUpdated ?? 0} taxas`
              );
              load();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSyncingStripe(false);
            }
          }}
        >
          {syncingStripe ? 'Sincronizando…' : 'Sincronizar Stripe'}
        </button>
        <button
          type="button"
          disabled={runningCrons}
          className="btn btn-secondary text-sm disabled:opacity-50"
          title="Roda sync Stripe + PIX + limpeza de pendentes + viradas (substitui cron externo)"
          onClick={async () => {
            if (
              !confirm(
                'Rodar sincronização completa agora?\n\n• Stripe / PIX\n• Cancelar pending abandonados\n• Viradas de lote'
              )
            ) {
              return;
            }
            setRunningCrons(true);
            try {
              const res = await fetch('/api/admin/orders/run-crons', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Falha nos crons');
              toast.success(data.message || 'Crons executados');
              load();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setRunningCrons(false);
            }
          }}
        >
          {runningCrons ? 'Rodando…' : 'Rodar crons agora'}
        </button>
        <button
          type="button"
          disabled={recalcStock}
          className="btn btn-secondary text-sm disabled:opacity-50"
          title="Recalcula vendidos/estoque dos lotes após migração Woo"
          onClick={async () => {
            if (
              !confirm(
                'Recalcular estoque de TODOS os eventos a partir dos ingressos pagos?\n\nCorrige Lote ativo “esgotado” após importação.'
              )
            ) {
              return;
            }
            setRecalcStock(true);
            try {
              const res = await fetch('/api/admin/orders/recalc-stock', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Falha');
              toast.success(data.message || 'Estoques recalculados');
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setRecalcStock(false);
            }
          }}
        >
          {recalcStock ? 'Recalculando…' : 'Recalcular estoques'}
        </button>
        <a href="/admin/ingresso-preview" className="btn btn-secondary text-sm inline-flex items-center gap-1.5">
          <FileText size={14} /> Layout + PDF exemplo
        </a>
        <a href="/admin/ferramentas" className="btn btn-secondary text-sm">
          Ferramentas
        </a>
      </div>

      <p className="text-[10px] text-zinc-500 mb-2 sm:hidden">
        ← Deslize a tabela na horizontal →
      </p>
      <div className="card overflow-x-auto overscroll-x-contain max-w-full -mx-0">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-left text-zinc-400 border-b border-white/10">
            <tr>
              <th className="p-3">Cliente</th>
              <th>Evento</th>
              <th>Lote</th>
              <th>Bruto</th>
              <th>Líquido</th>
              <th>Status</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredOrders.map((o) => {
              const canPdf = o.status === 'paid' && (o.tickets?.length || 0) > 0;
              const isOpen = expandedId === o.id;
              return (
                <Fragment key={o.id}>
                  <tr
                    className="hover:bg-white/5 cursor-pointer"
                    onClick={(e) => {
                      // não navega se clicou em botão/link
                      const t = e.target as HTMLElement;
                      if (t.closest('button, a, input')) return;
                      window.location.href = `/admin/pedidos/${o.id}`;
                    }}
                  >
                    <td className="p-3">
                      {(() => {
                        const emptyBuyer =
                          !o.buyerName?.trim() ||
                          o.buyerName === 'Checkout em andamento' ||
                          !o.buyerEmail?.trim();
                        return (
                          <>
                            {emptyBuyer && o.status === 'pending' ? (
                              <span className="text-amber-400/90 italic text-xs">
                                Sem cliente (checkout)
                              </span>
                            ) : (
                              o.buyerName || '—'
                            )}
                            <br />
                            <span className="text-xs text-zinc-500">
                              {o.buyerEmail?.trim() || '—'}
                            </span>
                            {o.status === 'pending' && emptyBuyer && (
                              <span className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                                Reserva abandonada?
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td>{o.event.title}</td>
                    <td className="text-xs">{o.lote?.nome || '—'}</td>
                    <td>{formatPrice(o.grossCents || o.totalCents)}</td>
                    <td>
                      <span
                        className={
                          (o.netCents ?? 0) < 0
                            ? 'text-red-400 font-medium'
                            : (o.netCents ?? 0) > 0
                              ? 'text-emerald-400'
                              : 'text-zinc-400'
                        }
                        title={
                          o.feeCents != null
                            ? `Taxa retida: ${formatPrice(o.feeCents)}${o.feeDetails ? ` · ${o.feeDetails}` : ''}`
                            : o.feeDetails || 'Líquido após taxas do gateway'
                        }
                      >
                        {formatPrice(o.netCents ?? 0)}
                      </span>
                      {(o.feeCents ?? 0) > 0 && (
                        <div className="text-[10px] text-zinc-500">
                          taxa {formatPrice(o.feeCents || 0)}
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        <a
                          href={`/admin/pedidos/${o.id}`}
                          className="text-xs px-2.5 py-1 rounded bg-sky-600/80 hover:bg-sky-600 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Detalhe
                        </a>
                        {canPdf && (
                          <>
                            <button
                              type="button"
                              onClick={() => setExpandedId(isOpen ? null : o.id)}
                              className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 cursor-pointer"
                            >
                              {isOpen ? 'Ocultar' : `Ingressos (${o.tickets!.length})`}
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadAllOrderPdfs(o)}
                              className="text-xs px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 cursor-pointer inline-flex items-center gap-1"
                            >
                              <Download size={12} /> PDF
                            </button>
                            <button
                              type="button"
                              disabled={resendingId?.startsWith(o.id)}
                              onClick={() => resendEmail(o, 'confirmation')}
                              title="Reenviar e-mail de confirmação com PDFs"
                              className="text-xs px-2.5 py-1 rounded bg-sky-600/80 hover:bg-sky-600 disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
                            >
                              {resendingId === `${o.id}:confirmation` ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Mail size={12} />
                              )}
                              E-mail
                            </button>
                          </>
                        )}
                        {o.accessCode && o.status !== 'pending' && (
                          <button
                            type="button"
                            disabled={resendingId?.startsWith(o.id)}
                            onClick={() => resendEmail(o, 'access_code')}
                            title="Reenviar só o código LN"
                            className="text-xs px-2.5 py-1 rounded bg-violet-600/70 hover:bg-violet-600 disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
                          >
                            {resendingId === `${o.id}:access_code` ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <KeyRound size={12} />
                            )}
                            Código
                          </button>
                        )}
                        {o.status === 'paid' && (
                          <button
                            type="button"
                            onClick={() => refund(o.id)}
                            className="text-xs bg-red-600/70 px-3 py-1 rounded cursor-pointer"
                          >
                            Estornar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && canPdf && (
                    <tr className="bg-zinc-950/50">
                      <td colSpan={7} className="p-3">
                        <div className="text-xs text-zinc-500 mb-2">Ingressos deste pedido</div>
                        <ul className="space-y-1.5">
                          {o.tickets!.map((t) => (
                            <li
                              key={t.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-1.5 px-2 rounded-lg border border-white/5"
                            >
                              <span>
                                <span className="text-zinc-300">{t.ticketType?.name || 'Ingresso'}</span>
                                {' · '}
                                <code className="font-mono text-emerald-400/90">{t.uniqueCode}</code>
                                <span className="text-zinc-600 ml-2">({ticketStatusLabel(t.status)})</span>
                              </span>
                              <button
                                type="button"
                                disabled={downloadingId === t.id || t.status === 'cancelled'}
                                onClick={() => downloadTicketPdf(t.id, t.uniqueCode)}
                                className="text-xs px-2.5 py-1 rounded bg-emerald-600/70 hover:bg-emerald-600 disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
                              >
                                <Download size={12} />
                                {downloadingId === t.id ? '...' : 'Baixar PDF'}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
          <span>
            Página {page} de {totalPages} · {total} pedido(s)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-40 hover:bg-white/5"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-40 hover:bg-white/5"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
