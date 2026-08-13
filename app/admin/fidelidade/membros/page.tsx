'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Mail, X } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

type MemberRow = {
  id: string;
  cardCode: string;
  buyerName: string;
  buyerEmail: string;
  status: string;
  entriesUsedInPeriod: number;
  currentPeriodEnd: string | null;
  createdAt: string;
  plan: { name: string; freeEntriesPerCycle: number };
  planPrice: { interval: string } | null;
};

type Redemption = {
  id: string;
  createdAt: string;
  withinFreeQuota: boolean;
  ticketsGranted: number;
  discountCentsApplied: number;
  event: { title: string; date: string } | null;
};

type CancellationReq = {
  id: string;
  status: string;
  reason: string;
  refundCents: number | null;
  requestedAt: string;
  processedAt: string | null;
};

type AuditEntry = {
  id: string;
  action: string;
  actor: string;
  detail: string | null;
  createdAt: string;
};

type MemberDetail = {
  id: string;
  cardCode: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  buyerCpf: string | null;
  buyerBirthDate: string | null;
  buyerZip: string | null;
  buyerStreet: string | null;
  buyerNumber: string | null;
  buyerComplement: string | null;
  buyerNeighborhood: string | null;
  buyerCity: string | null;
  buyerState: string | null;
  status: string;
  entriesUsedInPeriod: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  lastInvoiceAmountCents: number | null;
  createdAt: string;
  plan: { name: string; freeEntriesPerCycle: number };
  planPrice: { interval: string } | null;
  redemptions: Redemption[];
  cancellationRequests: CancellationReq[];
  referredBy: { id: string; buyerName: string; cardCode: string } | null;
  referrals: { id: string; buyerName: string; buyerEmail: string; status: string; createdAt: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  past_due: 'Pagamento pendente',
  pending: 'Aguardando 1ª cobrança',
  canceled: 'Cancelado',
};

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25',
  past_due: 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
  pending: 'bg-sky-500/15 text-sky-300 ring-sky-500/25',
  canceled: 'bg-zinc-500/20 text-zinc-400 ring-zinc-500/25',
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Maceio' });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Maceio' });
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  plan_created: 'Pacote criado',
  plan_updated: 'Pacote atualizado',
  plan_deactivated: 'Pacote desativado',
  cancellation_approved: 'Cancelamento aprovado',
  cancellation_rejected: 'Cancelamento recusado',
  referral_bonus_updated: 'Bônus de indicação alterado',
  checkin_recognized: 'Reconhecido no check-in',
  card_resent: 'Cartão reenviado',
};

export default function AdminFidelidadeMembrosPage() {
  const [items, setItems] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [status, setStatus] = useState('all');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (qDebounced) params.set('q', qDebounced);
      if (status !== 'all') params.set('status', status);
      params.set('page', String(page));
      const res = await fetch(`/api/admin/loyalty-members?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar');
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPageSize(data.pageSize || 30);
    } catch {
      toast.error('Não foi possível carregar sócios');
    } finally {
      setLoading(false);
    }
  }, [qDebounced, status, page]);

  useEffect(() => {
    setPage(1);
  }, [qDebounced, status]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    setAuditLog([]);
    try {
      const res = await fetch(`/api/admin/loyalty-members/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar detalhe');
      const data = await res.json();
      setDetail(data.membership);
      setAuditLog(data.auditLog || []);
    } catch {
      toast.error('Não foi possível carregar o detalhe do sócio');
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function resendCard() {
    if (!selectedId) return;
    setResending(true);
    try {
      const res = await fetch(`/api/admin/loyalty-members/${selectedId}/resend-card`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao reenviar');
      toast.success('Cartão reenviado por e-mail');
      openDetail(selectedId);
    } catch (e) {
      toast.error((e as Error).message || 'Falha ao reenviar cartão');
    } finally {
      setResending(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
          <h1 className="text-2xl font-semibold tracking-tight">Sócios</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Busca, dados completos, histórico de resgates e trilha de auditoria por sócio.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            className="input w-56"
            placeholder="Buscar nome, e-mail, cartão…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input w-auto min-w-[160px]"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="past_due">Pagamento pendente</option>
            <option value="pending">Aguardando 1ª cobrança</option>
            <option value="canceled">Cancelados</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm py-12 text-center">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-10 text-center text-zinc-500 text-sm">
          Nenhum sócio encontrado.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-white/10">
                <th className="px-4 py-3 font-medium">Sócio</th>
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Cota do ciclo</th>
                <th className="px-4 py-3 font-medium">Renova em</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => openDetail(m.id)}
                  className="border-b border-white/5 last:border-0 hover:bg-white/5 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="text-white">{m.buyerName || '—'}</div>
                    <div className="text-xs text-zinc-500">{m.buyerEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {m.plan.name}
                    {m.planPrice && (
                      <div className="text-xs text-zinc-500">{m.planPrice.interval}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ring-1 ${STATUS_STYLE[m.status] || STATUS_STYLE.canceled}`}
                    >
                      {STATUS_LABEL[m.status] || m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 tabular-nums">
                    {m.entriesUsedInPeriod} / {m.plan.freeEntriesPerCycle}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(m.currentPeriodEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-sm">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="text-zinc-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima
          </button>
        </div>
      )}

      {selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSelectedId(null)}>
          <div
            className="w-full max-w-lg h-full bg-zinc-950 border-l border-white/10 overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Detalhe do sócio</h2>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-zinc-500 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading || !detail ? (
              <div className="text-zinc-500 text-sm py-12 text-center">Carregando…</div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-white font-medium">{detail.buyerName}</div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ring-1 ${STATUS_STYLE[detail.status] || STATUS_STYLE.canceled}`}
                    >
                      {STATUS_LABEL[detail.status] || detail.status}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">{detail.buyerEmail}</div>
                  {detail.buyerPhone && <div className="text-xs text-zinc-500">{detail.buyerPhone}</div>}
                  <div className="text-xs text-zinc-500 font-mono pt-1">{detail.cardCode}</div>
                  {(detail.buyerStreet || detail.buyerCity) && (
                    <div className="text-xs text-zinc-500 pt-1">
                      {[detail.buyerStreet, detail.buyerNumber, detail.buyerNeighborhood, detail.buyerCity, detail.buyerState]
                        .filter(Boolean)
                        .join(', ')}
                      {detail.buyerZip ? ` · ${detail.buyerZip}` : ''}
                    </div>
                  )}
                  {detail.buyerBirthDate && (
                    <div className="text-xs text-zinc-500">Nascimento: {fmtDate(detail.buyerBirthDate)}</div>
                  )}
                  <button
                    type="button"
                    onClick={resendCard}
                    disabled={resending}
                    className="btn btn-secondary text-xs mt-3 disabled:opacity-60"
                  >
                    <Mail className="w-3.5 h-3.5 mr-1.5 inline" />
                    {resending ? 'Enviando…' : 'Reenviar cartão por e-mail'}
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 space-y-1 text-sm">
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Plano</div>
                  <div className="text-zinc-200">
                    {detail.plan.name}
                    {detail.planPrice && ` · ${detail.planPrice.interval}`}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Cota do ciclo: {detail.entriesUsedInPeriod} / {detail.plan.freeEntriesPerCycle}
                  </div>
                  <div className="text-xs text-zinc-500">Renova em: {fmtDate(detail.currentPeriodEnd)}</div>
                  {detail.lastInvoiceAmountCents != null && (
                    <div className="text-xs text-zinc-500">
                      Última fatura: {formatPrice(detail.lastInvoiceAmountCents)}
                    </div>
                  )}
                </div>

                {detail.referredBy && (
                  <div className="text-xs text-zinc-500">
                    Indicado por: {detail.referredBy.buyerName} ({detail.referredBy.cardCode})
                  </div>
                )}
                {detail.referrals.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
                    <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                      Indicações feitas ({detail.referrals.length})
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {detail.referrals.map((r) => (
                        <div key={r.id} className="flex justify-between text-zinc-400">
                          <span>{r.buyerName}</span>
                          <span>{fmtDate(r.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                    Extrato de resgates ({detail.redemptions.length})
                  </div>
                  {detail.redemptions.length === 0 ? (
                    <p className="text-xs text-zinc-600">Nenhum resgate ainda.</p>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {detail.redemptions.map((r) => (
                        <div key={r.id} className="flex justify-between text-zinc-400">
                          <span>{r.event?.title || '—'}</span>
                          <span>{r.withinFreeQuota ? 'Grátis' : 'Com desconto'} · {fmtDate(r.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {detail.cancellationRequests.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
                    <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                      Solicitações de cancelamento
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {detail.cancellationRequests.map((c) => (
                        <div key={c.id} className="flex justify-between text-zinc-400">
                          <span>{c.status}</span>
                          <span>{fmtDate(c.requestedAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                    Trilha de auditoria
                  </div>
                  {auditLog.length === 0 ? (
                    <p className="text-xs text-zinc-600">Nenhuma ação registrada ainda.</p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {auditLog.map((a) => (
                        <div key={a.id} className="border-b border-white/5 last:border-0 pb-2 last:pb-0">
                          <div className="text-zinc-300">
                            {AUDIT_ACTION_LABEL[a.action] || a.action}
                          </div>
                          {a.detail && <div className="text-zinc-500">{a.detail}</div>}
                          <div className="text-zinc-600">
                            {a.actor} · {fmtDateTime(a.createdAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
