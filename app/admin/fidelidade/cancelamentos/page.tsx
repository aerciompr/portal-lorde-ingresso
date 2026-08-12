'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

type LoyaltyCancelItem = {
  id: string;
  reason: string;
  status: string;
  refundCents: number | null;
  previewRefundCents: number | null;
  adminNotes?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  membership: {
    id: string;
    cardCode: string;
    buyerName: string;
    buyerEmail: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    lastInvoiceAmountCents: number | null;
    plan: { name: string };
  };
};

export default function AdminFidelidadeCancelamentosPage() {
  const [items, setItems] = useState<LoyaltyCancelItem[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/loyalty-cancellations?status=${filter}`, {
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
        ? 'Aprovar e estornar proporcionalmente + cancelar a assinatura no Stripe?'
        : 'Recusar esta solicitação?';
    if (!confirm(msg)) return;

    let notes = '';
    if (action === 'reject') {
      notes = window.prompt('Motivo da recusa (opcional):') || '';
    }

    setBusyId(id);
    try {
      const res = await fetch('/api/admin/loyalty-cancellations', {
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
      <Link
        href="/admin/fidelidade"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Clube de fidelidade
      </Link>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cancelamentos do clube</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Solicitações dos sócios em Meus Ingressos. Estorno proporcional ao tempo restante
            do período pago — aprovar também cancela a assinatura no Stripe.
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
            const refund = cr.status === 'pending' ? cr.previewRefundCents : cr.refundCents;
            return (
              <div
                key={cr.id}
                className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-medium text-white">{cr.membership.buyerName || '—'}</div>
                    <div className="text-xs text-zinc-500">{cr.membership.buyerEmail}</div>
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
                    <span className="text-zinc-500 text-xs">Plano</span>
                    <div>{cr.membership.plan?.name}</div>
                    <div className="text-xs text-zinc-500 font-mono">{cr.membership.cardCode}</div>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">
                      {cr.status === 'pending' ? 'Estorno estimado' : 'Estorno processado'}
                    </span>
                    <div>{refund != null ? formatPrice(refund) : '—'}</div>
                    <div className="text-xs text-zinc-500">
                      Última fatura: {formatPrice(cr.membership.lastInvoiceAmountCents || 0)}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-zinc-950/60 border border-white/5 px-3 py-2 text-sm text-zinc-300 mb-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Motivo do sócio
                  </div>
                  {cr.reason || '—'}
                </div>

                {cr.adminNotes && (
                  <div className="text-xs text-zinc-500 mb-3">Admin: {cr.adminNotes}</div>
                )}

                <div className="text-[11px] text-zinc-600 mb-3">
                  Solicitado em{' '}
                  {new Date(cr.requestedAt).toLocaleString('pt-BR', {
                    timeZone: 'America/Maceio',
                  })}
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
