'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatPrice, formatDate } from '@/lib/utils';

type CancelItem = {
  id: string;
  reason: string;
  status: string;
  adminNotes?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  order: {
    id: string;
    buyerName: string;
    buyerEmail: string;
    totalCents: number;
    accessCode?: string | null;
    status: string;
    event: { title: string; date: string; cancelFeePercent?: number | null };
    tickets: { id: string; uniqueCode: string; status: string }[];
  };
};

export default function AdminCancelamentosPage() {
  const [items, setItems] = useState<CancelItem[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cancellations?status=${filter}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Falha ao carregar');
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      toast.error('Não foi possível carregar solicitações');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    const msg =
      action === 'approve'
        ? 'Aprovar e estornar o pagamento no gateway?'
        : 'Recusar esta solicitação?';
    if (!confirm(msg)) return;

    let notes = '';
    if (action === 'reject') {
      notes = window.prompt('Motivo da recusa (opcional):') || '';
    }

    setBusyId(id);
    try {
      const res = await fetch('/api/admin/cancellations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, adminNotes: notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      toast.success(action === 'approve' ? 'Estorno aprovado' : 'Solicitação recusada');
      load();
    } catch (e) {
      toast.error((e as Error).message || 'Falha');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cancelamentos</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Solicitações dos clientes em Meus Ingressos. Aprove (estorna) ou recuse.
          </p>
        </div>
        <select
          className="input w-auto min-w-[160px]"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="pending">Em análise</option>
          <option value="approved">Aprovados</option>
          <option value="rejected">Recusados</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm py-12 text-center">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-10 text-center text-zinc-500 text-sm">
          Nenhuma solicitação {filter === 'pending' ? 'em análise' : 'neste filtro'}.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((cr) => {
            const fee = cr.order.event?.cancelFeePercent ?? 0;
            const refund = Math.round(cr.order.totalCents * (1 - fee / 100));
            return (
              <div
                key={cr.id}
                className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-medium text-white">{cr.order.buyerName || '—'}</div>
                    <div className="text-xs text-zinc-500">{cr.order.buyerEmail}</div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full ring-1 ${
                      cr.status === 'pending'
                        ? 'bg-amber-500/15 text-amber-300 ring-amber-500/25'
                        : cr.status === 'approved'
                          ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25'
                          : 'bg-zinc-500/20 text-zinc-400 ring-zinc-500/25'
                    }`}
                  >
                    {cr.status === 'pending'
                      ? 'Em análise'
                      : cr.status === 'approved'
                        ? 'Aprovado'
                        : 'Recusado'}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-2 text-sm text-zinc-300 mb-3">
                  <div>
                    <span className="text-zinc-500 text-xs">Evento</span>
                    <div>{cr.order.event?.title}</div>
                    <div className="text-xs text-zinc-500">
                      {cr.order.event?.date ? formatDate(cr.order.event.date) : ''}
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Pedido</span>
                    <div className="font-mono text-xs">{cr.order.accessCode || cr.order.id.slice(0, 12)}</div>
                    <div>
                      {formatPrice(cr.order.totalCents)}
                      {fee > 0 && (
                        <span className="text-xs text-zinc-500">
                          {' '}
                          → estorno ~{formatPrice(refund)} (taxa {fee}%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-zinc-950/60 border border-white/5 px-3 py-2 text-sm text-zinc-300 mb-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Motivo do cliente
                  </div>
                  {cr.reason || '—'}
                </div>

                {cr.adminNotes && (
                  <div className="text-xs text-zinc-500 mb-3">Admin: {cr.adminNotes}</div>
                )}

                <div className="text-[11px] text-zinc-600 mb-3">
                  Solicitado em {new Date(cr.requestedAt).toLocaleString('pt-BR')}
                </div>

                {cr.status === 'pending' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === cr.id}
                      onClick={() => act(cr.id, 'approve')}
                      className="btn btn-primary text-sm"
                    >
                      {busyId === cr.id ? '…' : 'Aprovar e estornar'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === cr.id}
                      onClick={() => act(cr.id, 'reject')}
                      className="btn btn-secondary text-sm"
                    >
                      Recusar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
