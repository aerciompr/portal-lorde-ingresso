'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Download } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import PeriodFilter from '@/components/PeriodFilter';
import { periodToRange, type PeriodId } from '@/lib/period';

export const dynamic = 'force-dynamic';

type RechartsModule = typeof import('recharts');

type SeriesPoint = { month: string; newMembers: number; canceled: number };

type ReportPayload = {
  series: SeriesPoint[];
  mrrCents: number;
  distribution: { planName: string; count: number }[];
  eventRanking: { eventTitle: string; count: number }[];
};

type AuditEntry = {
  id: string;
  action: string;
  actor: string;
  entityType: string;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
};

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

function fmtMonth(k: string) {
  const [y, m] = k.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Maceio' });
}

export default function AdminFidelidadeRelatoriosPage() {
  const [tab, setTab] = useState<'relatorios' | 'auditoria'>('relatorios');

  const [period, setPeriod] = useState<PeriodId>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [Recharts, setRecharts] = useState<RechartsModule | null>(null);

  const [auditItems, setAuditItems] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditAction, setAuditAction] = useState('');
  const [auditActor, setAuditActor] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    import('recharts').then(setRecharts).catch(() => undefined);
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const range = periodToRange(period, customFrom, customTo);
      const qs = new URLSearchParams();
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      const res = await fetch(`/api/admin/loyalty-reports?${qs}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar');
      setData(json);
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao carregar relatório');
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (tab === 'relatorios') loadReport();
  }, [tab, loadReport]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const qs = new URLSearchParams();
      if (auditAction) qs.set('action', auditAction);
      if (auditActor) qs.set('actor', auditActor);
      qs.set('page', String(auditPage));
      const res = await fetch(`/api/admin/loyalty-audit?${qs}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar');
      setAuditItems(json.items || []);
      setAuditTotal(json.total || 0);
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao carregar auditoria');
    } finally {
      setAuditLoading(false);
    }
  }, [auditAction, auditActor, auditPage]);

  useEffect(() => {
    if (tab === 'auditoria') loadAudit();
  }, [tab, loadAudit]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditAction, auditActor]);

  const chartData = useMemo(
    () => (data?.series || []).map((s) => ({ ...s, monthLabel: fmtMonth(s.month) })),
    [data]
  );

  const maxDistribution = useMemo(
    () => Math.max(1, ...(data?.distribution.map((d) => d.count) || [1])),
    [data]
  );
  const maxRanking = useMemo(
    () => Math.max(1, ...(data?.eventRanking.map((e) => e.count) || [1])),
    [data]
  );

  function exportCsv() {
    if (!data) return;
    const rows: string[][] = [['Mês', 'Novos sócios', 'Cancelamentos']];
    for (const s of data.series) rows.push([fmtMonth(s.month), String(s.newMembers), String(s.canceled)]);
    rows.push([]);
    rows.push(['Plano', 'Assinantes ativos/pendentes']);
    for (const d of data.distribution) rows.push([d.planName, String(d.count)]);
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clube-fidelidade-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / 40));

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
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios e auditoria</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Série temporal do clube, distribuição por plano e trilha de ações administrativas.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setTab('relatorios')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              tab === 'relatorios'
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'border-white/10 text-zinc-400 hover:bg-white/5'
            }`}
          >
            Relatórios
          </button>
          <button
            type="button"
            onClick={() => setTab('auditoria')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              tab === 'auditoria'
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'border-white/10 text-zinc-400 hover:bg-white/5'
            }`}
          >
            Auditoria
          </button>
        </div>
      </div>

      {tab === 'relatorios' ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <PeriodFilter
              period={period}
              onPeriodChange={setPeriod}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              hint="Novos sócios e cancelamentos contam pela data do evento; MRR é o snapshot atual."
            />
          </div>

          {loading ? (
            <div className="text-zinc-500 text-sm py-12 text-center">Carregando…</div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">MRR atual</div>
                  <div className="mt-1 text-2xl font-semibold text-white tabular-nums">
                    {formatPrice(data.mrrCents)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Novos sócios (período)
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-emerald-400 tabular-nums">
                    {data.series.reduce((s, x) => s + x.newMembers, 0)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Cancelamentos (período)
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-red-400 tabular-nums">
                    {data.series.reduce((s, x) => s + x.canceled, 0)}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-white">Novos sócios × cancelamentos</div>
                  <button type="button" onClick={exportCsv} className="btn btn-secondary text-xs">
                    <Download className="w-3.5 h-3.5 mr-1.5 inline" />
                    Exportar CSV
                  </button>
                </div>
                {Recharts && chartData.length > 0 ? (
                  <div style={{ width: '100%', height: 260 }}>
                    <Recharts.ResponsiveContainer>
                      <Recharts.BarChart data={chartData}>
                        <Recharts.CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <Recharts.XAxis dataKey="monthLabel" tick={{ fill: '#71717a', fontSize: 11 }} />
                        <Recharts.YAxis tick={{ fill: '#71717a', fontSize: 11 }} allowDecimals={false} />
                        <Recharts.Tooltip
                          contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 12 }}
                        />
                        <Recharts.Legend wrapperStyle={{ fontSize: 12 }} />
                        <Recharts.Bar dataKey="newMembers" name="Novos" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Recharts.Bar dataKey="canceled" name="Cancelados" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </Recharts.BarChart>
                    </Recharts.ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600 py-8 text-center">Sem dados no período.</div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                  <div className="text-sm font-medium text-white mb-3">Distribuição por plano</div>
                  {data.distribution.length === 0 ? (
                    <p className="text-xs text-zinc-600">Sem assinantes ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.distribution.map((d) => (
                        <div key={d.planName}>
                          <div className="flex justify-between text-xs text-zinc-400 mb-1">
                            <span>{d.planName}</span>
                            <span className="tabular-nums">{d.count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-800/60 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${(d.count / maxDistribution) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                  <div className="text-sm font-medium text-white mb-3">
                    Ranking de eventos (reconhecimento no check-in)
                  </div>
                  {data.eventRanking.length === 0 ? (
                    <p className="text-xs text-zinc-600">
                      Nenhum reconhecimento de sócio no check-in ainda neste período.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.eventRanking.map((e) => (
                        <div key={e.eventTitle}>
                          <div className="flex justify-between text-xs text-zinc-400 mb-1">
                            <span className="truncate">{e.eventTitle}</span>
                            <span className="tabular-nums">{e.count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-800/60 overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full"
                              style={{ width: `${(e.count / maxRanking) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 flex flex-wrap gap-2">
            <select
              className="input w-auto min-w-[200px]"
              value={auditAction}
              onChange={(e) => setAuditAction(e.target.value)}
            >
              <option value="">Todas as ações</option>
              {Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              className="input w-auto min-w-[200px]"
              placeholder="Filtrar por ator (e-mail)"
              value={auditActor}
              onChange={(e) => setAuditActor(e.target.value)}
            />
          </div>

          {auditLoading ? (
            <div className="text-zinc-500 text-sm py-12 text-center">Carregando…</div>
          ) : auditItems.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-10 text-center text-zinc-500 text-sm">
              Nenhuma ação registrada com esses filtros.
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 border-b border-white/10">
                    <th className="px-4 py-3 font-medium">Ação</th>
                    <th className="px-4 py-3 font-medium">Detalhe</th>
                    <th className="px-4 py-3 font-medium">Ator</th>
                    <th className="px-4 py-3 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {auditItems.map((a) => (
                    <tr key={a.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 text-zinc-200">
                        {AUDIT_ACTION_LABEL[a.action] || a.action}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{a.detail || '—'}</td>
                      <td className="px-4 py-3 text-zinc-400">{a.actor}</td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {fmtDateTime(a.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {auditTotalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={auditPage <= 1}
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="text-zinc-500">
                {auditPage} / {auditTotalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={auditPage >= auditTotalPages}
                onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
