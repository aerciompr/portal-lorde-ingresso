'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatPrice, formatDate, paymentMethodLabel } from '@/lib/utils';
import { toast } from 'sonner';
import {
  BarChart3,
  Calendar,
  Download,
  FileText,
  LayoutDashboard,
  Loader2,
  Play,
  RefreshCw,
  Ticket,
  TrendingUp,
  Undo2,
  Wallet,
} from 'lucide-react';
import PeriodFilter from '@/components/PeriodFilter';
import { periodToRange, type PeriodId } from '@/lib/period';

export const dynamic = 'force-dynamic';

type RechartsModule = typeof import('recharts');

type Bucket = {
  grossCents: number;
  netCents: number;
  feeCents: number;
  refundCents: number;
  paidOrders: number;
  paidTickets: number;
  refundedOrders: number;
  pendingOrders: number;
};

type LoteRow = Bucket & { name: string };
type TicketTypeRow = { name: string; paidTickets: number; grossCents: number };

type EventReport = Bucket & {
  eventId: string;
  title: string;
  date: string;
  byLote: LoteRow[];
  byTicketType: TicketTypeRow[];
  catalog: { id: string; name: string; totalQty: number; sold: number; priceCents: number }[];
};

type ReportsPayload = {
  generatedAt: string;
  period?: { from: string | null; to: string | null; eventId?: string | null };
  general: Bucket & {
    byMethod: (Bucket & { method: string })[];
  };
  byEvent: EventReport[];
};

type EventOption = { id: string; title: string; date: string };

type TabId = 'geral' | 'eventos';

function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'good' | 'bad' | 'muted';
  icon?: typeof Wallet;
}) {
  const valueCls =
    tone === 'good'
      ? 'text-emerald-400'
      : tone === 'bad'
        ? 'text-red-400'
        : tone === 'muted'
          ? 'text-zinc-300'
          : 'text-white';
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
        {Icon && (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400">
            <Icon size={16} />
          </span>
        )}
      </div>
      <div className={`mt-2 text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums ${valueCls}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-zinc-600 mt-1.5">{hint}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/40 px-6 py-12 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>('geral');
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [filtersDirty, setFiltersDirty] = useState(false);
  const [eventId, setEventId] = useState<string>('');
  const [filterEventId, setFilterEventId] = useState<string>('');
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);
  const [Recharts, setRecharts] = useState<RechartsModule | null>(null);
  const [period, setPeriod] = useState<PeriodId>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    import('recharts').then(setRecharts).catch(() => undefined);
  }, []);

  // Deep-link: /admin/reports?eventId=...
  useEffect(() => {
    const q = searchParams.get('eventId') || '';
    if (q) {
      setFilterEventId(q);
      setEventId(q);
      setTab('eventos');
    }
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/admin/events')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: EventOption[]) => {
        if (Array.isArray(list)) {
          setEventOptions(
            list.map((e: { id: string; title: string; date: string }) => ({
              id: e.id,
              title: e.title,
              date: e.date,
            }))
          );
        }
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = periodToRange(period, customFrom, customTo);
      const qs = new URLSearchParams();
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      if (filterEventId) qs.set('eventId', filterEventId);
      const res = await fetch(`/api/admin/reports?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar');
      setData(json as ReportsPayload);
      setHasGenerated(true);
      setFiltersDirty(false);
      setEventId((prev) => {
        const payload = json as ReportsPayload;
        if (filterEventId && payload.byEvent?.some((e) => e.eventId === filterEventId)) {
          return filterEventId;
        }
        if (prev && payload.byEvent?.some((e) => e.eventId === prev)) return prev;
        const firstWithSales = payload.byEvent?.find((e) => e.paidOrders > 0);
        return firstWithSales?.eventId || payload.byEvent?.[0]?.eventId || '';
      });
      if (filterEventId) setTab('eventos');
      toast.success('Relatório gerado');
    } catch (e) {
      toast.error((e as Error).message || 'Erro nos relatórios');
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo, filterEventId]);

  const markDirty = useCallback(() => {
    if (hasGenerated) setFiltersDirty(true);
  }, [hasGenerated]);

  const selected = useMemo(
    () => data?.byEvent.find((e) => e.eventId === eventId) || null,
    [data, eventId]
  );

  function exportPdf() {
    if (!data) {
      toast.error('Gere o relatório antes de exportar');
      return;
    }
    window.print();
  }

  const chartByEvent = useMemo(() => {
    if (!data) return [];
    return data.byEvent
      .filter((e) => e.paidOrders > 0 || e.refundedOrders > 0)
      .slice(0, 12)
      .map((e) => ({
        name: e.title.length > 16 ? e.title.slice(0, 14) + '…' : e.title,
        fullName: e.title,
        bruto: e.grossCents / 100,
        liquido: e.netCents / 100,
        tickets: e.paidTickets,
      }));
  }, [data]);

  const chartByLote = useMemo(() => {
    if (!selected) return [];
    return selected.byLote.map((l) => ({
      name: l.name.length > 14 ? l.name.slice(0, 12) + '…' : l.name,
      fullName: l.name,
      bruto: l.grossCents / 100,
      liquido: l.netCents / 100,
      tickets: l.paidTickets,
    }));
  }, [selected]);

  function exportCsv() {
    if (!data) {
      toast.error('Gere o relatório antes de exportar');
      return;
    }
    const rows: string[][] = [
      ['Visão', 'Evento', 'Data', 'Pedidos pagos', 'Ingressos pagos', 'Bruto (R$)', 'Taxas (R$)', 'Líquido (R$)', 'Estornos (R$)', 'Pedidos estornados', 'Pendentes'],
    ];
    for (const e of data.byEvent) {
      rows.push([
        'Evento',
        e.title,
        e.date ? formatDate(e.date) : '',
        String(e.paidOrders),
        String(e.paidTickets),
        (e.grossCents / 100).toFixed(2),
        (e.feeCents / 100).toFixed(2),
        (e.netCents / 100).toFixed(2),
        (e.refundCents / 100).toFixed(2),
        String(e.refundedOrders),
        String(e.pendingOrders),
      ]);
      for (const l of e.byLote || []) {
        rows.push([
          'Lote',
          `${e.title} · ${l.name}`,
          '',
          String(l.paidOrders),
          String(l.paidTickets),
          (l.grossCents / 100).toFixed(2),
          (l.feeCents / 100).toFixed(2),
          (l.netCents / 100).toFixed(2),
          (l.refundCents / 100).toFixed(2),
          String(l.refundedOrders),
          String(l.pendingOrders),
        ]);
      }
    }
    rows.push([
      'GERAL',
      filterEventId ? 'Evento filtrado' : 'Todos os eventos',
      '',
      String(data.general.paidOrders),
      String(data.general.paidTickets),
      (data.general.grossCents / 100).toFixed(2),
      (data.general.feeCents / 100).toFixed(2),
      (data.general.netCents / 100).toFixed(2),
      (data.general.refundCents / 100).toFixed(2),
      String(data.general.refundedOrders),
      String(data.general.pendingOrders),
    ]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorios-lorde-nelson-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  }

  const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'geral', label: 'Geral', icon: LayoutDashboard },
    { id: 'eventos', label: 'Por evento', icon: Calendar },
  ];

  const g = data?.general;

  return (
    <div className="max-w-6xl mx-auto pb-10 reports-print-root">
      {/* Header — some controls hide on print */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 print:mb-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-zinc-400 mt-1 print:text-zinc-600">
            Escolha filtros e gere · bruto/líquido só de pedidos{' '}
            <strong className="text-zinc-300">pagos</strong>
          </p>
          {data?.generatedAt && (
            <p className="text-[11px] text-zinc-600 mt-1">
              Gerado em{' '}
              {new Date(data.generatedAt).toLocaleString('pt-BR', {
                timeZone: 'America/Maceio',
              })}
              {filtersDirty && (
                <span className="text-amber-400 ml-2 print:hidden">· filtros alterados — gere de novo</span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Gerar relatório
          </button>
          {hasGenerated && (
            <>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
              >
                <Download size={14} /> CSV
              </button>
              <button
                type="button"
                onClick={exportPdf}
                className="inline-flex items-center gap-2 rounded-xl bg-white text-black px-3 py-2 text-sm font-medium hover:bg-zinc-100"
              >
                <FileText size={14} /> Exportar PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filtros — sempre visíveis */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-zinc-900/80 p-4 sm:p-5 space-y-4 print:border-0 print:p-0 print:bg-transparent">
        <PeriodFilter
          period={period}
          onPeriodChange={(p) => {
            setPeriod(p);
            markDirty();
          }}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={(v) => {
            setCustomFrom(v);
            markDirty();
          }}
          onCustomToChange={(v) => {
            setCustomTo(v);
            markDirty();
          }}
        />
        <div className="print:hidden">
          <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
            Evento (opcional)
          </label>
          <select
            className="input w-full max-w-xl text-sm"
            value={filterEventId}
            onChange={(e) => {
              setFilterEventId(e.target.value);
              markDirty();
            }}
          >
            <option value="">Todos os eventos</option>
            {eventOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
        {!hasGenerated && (
          <p className="text-xs text-zinc-500 print:hidden">
            Defina o período e clique em <strong className="text-zinc-300">Gerar relatório</strong> para
            ver KPIs, gráficos e tabelas.
          </p>
        )}
      </div>

      {!hasGenerated && !loading && (
        <EmptyState text="Nenhum relatório gerado ainda. Escolha o período (e opcionalmente um evento) e clique em Gerar relatório." />
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-16 text-zinc-400 gap-2">
          <Loader2 className="animate-spin" size={18} /> Gerando relatório…
        </div>
      )}

      {data && g && (
        <>
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-zinc-900 border border-white/10 w-full sm:w-auto mb-6 max-w-md print:hidden">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                active ? 'bg-white/10 text-emerald-400' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─── GERAL ─── */}
      {tab === 'geral' && (
        <div className="space-y-6 reports-print-section">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              label="Bruto (pagos)"
              value={formatPrice(g.grossCents)}
              hint={`${g.paidOrders} pedido(s)`}
              icon={Wallet}
            />
            <KpiCard
              label="Líquido"
              value={formatPrice(g.netCents)}
              hint={`Taxas ${formatPrice(g.feeCents)}`}
              tone="good"
              icon={TrendingUp}
            />
            <KpiCard
              label="Estornos"
              value={formatPrice(g.refundCents)}
              hint={`${g.refundedOrders} pedido(s)`}
              tone="bad"
              icon={Undo2}
            />
            <KpiCard
              label="Ingressos pagos"
              value={g.paidTickets}
              hint={`${g.pendingOrders} pendente(s)`}
              icon={Ticket}
            />
          </div>

          <div className="grid lg:grid-cols-5 gap-4 sm:gap-6">
            <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-zinc-900/80 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={16} className="text-emerald-400" />
                <h2 className="text-sm font-medium">Bruto e líquido por evento</h2>
              </div>
              <div className="h-72 sm:h-80">
                {chartByEvent.length === 0 ? (
                  <EmptyState text="Ainda não há vendas pagas para graficar." />
                ) : Recharts ? (
                  <Recharts.ResponsiveContainer width="100%" height="100%">
                    <Recharts.BarChart data={chartByEvent} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                      <Recharts.CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <Recharts.XAxis dataKey="name" tick={{ fontSize: 11, fill: '#a1a1aa' }} />
                      <Recharts.YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} />
                      <Recharts.Tooltip
                        contentStyle={{
                          background: '#18181b',
                          border: '1px solid #3f3f46',
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        formatter={(value, name) => {
                          const n = typeof value === 'number' ? value : Number(value) || 0;
                          if (name === 'tickets') return [n, 'Ingressos'];
                          return [
                            n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                            name === 'bruto' ? 'Bruto' : 'Líquido',
                          ];
                        }}
                        labelFormatter={(_, payload) =>
                          (payload?.[0]?.payload as { fullName?: string })?.fullName || ''
                        }
                      />
                      <Recharts.Legend />
                      <Recharts.Bar dataKey="bruto" name="Bruto" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Recharts.Bar dataKey="liquido" name="Líquido" fill="#34d399" radius={[4, 4, 0, 0]} />
                    </Recharts.BarChart>
                  </Recharts.ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    Carregando gráfico…
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-zinc-900/80 p-4 sm:p-6">
              <h2 className="text-sm font-medium mb-4">Por forma de pagamento</h2>
              {g.byMethod.length === 0 ? (
                <EmptyState text="Sem pagamentos ainda." />
              ) : (
                <div className="space-y-3">
                  {g.byMethod
                    .filter((m) => m.paidOrders > 0 || m.refundedOrders > 0)
                    .sort((a, b) => b.grossCents - a.grossCents)
                    .map((m) => (
                      <div
                        key={m.method}
                        className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 last:border-0"
                      >
                        <div>
                          <div className="text-sm font-medium">{paymentMethodLabel(m.method)}</div>
                          <div className="text-[11px] text-zinc-500">
                            {m.paidOrders} pago(s) · {m.paidTickets} ingresso(s)
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="text-sm">{formatPrice(m.grossCents)}</div>
                          <div className="text-[11px] text-emerald-400">{formatPrice(m.netCents)}</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Resumo por evento</h2>
              <button
                type="button"
                className="text-xs text-emerald-400 hover:underline"
                onClick={() => setTab('eventos')}
              >
                Ver detalhe →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 border-b border-white/5">
                    <th className="px-4 sm:px-6 py-3 font-medium">Evento</th>
                    <th className="px-3 py-3 font-medium text-right">Ingressos</th>
                    <th className="px-3 py-3 font-medium text-right">Bruto</th>
                    <th className="px-3 py-3 font-medium text-right hidden sm:table-cell">Taxas</th>
                    <th className="px-3 py-3 font-medium text-right">Líquido</th>
                    <th className="px-3 py-3 font-medium text-right hidden md:table-cell">Estornos</th>
                    <th className="px-4 sm:px-6 py-3 font-medium text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {data.byEvent.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-zinc-500">
                        Nenhum evento cadastrado.
                      </td>
                    </tr>
                  ) : (
                    data.byEvent.map((e) => (
                      <tr key={e.eventId} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 sm:px-6 py-3">
                          <div className="font-medium text-zinc-100 max-w-[14rem] sm:max-w-xs truncate">
                            {e.title}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {e.date ? formatDate(e.date) : '—'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{e.paidTickets}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatPrice(e.grossCents)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-zinc-500 hidden sm:table-cell">
                          {formatPrice(e.feeCents)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-emerald-400">
                          {formatPrice(e.netCents)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-red-400/90 hidden md:table-cell">
                          {formatPrice(e.refundCents)}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-right">
                          <button
                            type="button"
                            className="text-xs text-emerald-400 hover:underline"
                            onClick={() => {
                              setEventId(e.eventId);
                              setTab('eventos');
                            }}
                          >
                            Detalhe
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-950/50 text-sm font-medium">
                    <td className="px-4 sm:px-6 py-3">Total geral</td>
                    <td className="px-3 py-3 text-right tabular-nums">{g.paidTickets}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatPrice(g.grossCents)}</td>
                    <td className="px-3 py-3 text-right tabular-nums hidden sm:table-cell">
                      {formatPrice(g.feeCents)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-400">
                      {formatPrice(g.netCents)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-red-400 hidden md:table-cell">
                      {formatPrice(g.refundCents)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── POR EVENTO ─── */}
      {tab === 'eventos' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 sm:p-5">
            <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
              Selecione o evento
            </label>
            <select
              className="input w-full max-w-xl"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              {data.byEvent.length === 0 && <option value="">Nenhum evento</option>}
              {data.byEvent.map((e) => (
                <option key={e.eventId} value={e.eventId}>
                  {e.title}
                  {e.paidTickets > 0 ? ` · ${e.paidTickets} ing.` : ''}
                </option>
              ))}
            </select>
          </div>

          {!selected ? (
            <EmptyState text="Escolha um evento para ver o relatório." />
          ) : (
            <>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-white">{selected.title}</h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {selected.date ? formatDate(selected.date) : 'Data não informada'}
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard
                  label="Bruto"
                  value={formatPrice(selected.grossCents)}
                  hint={`${selected.paidOrders} pedido(s) pago(s)`}
                  icon={Wallet}
                />
                <KpiCard
                  label="Líquido"
                  value={formatPrice(selected.netCents)}
                  hint={`Taxas ${formatPrice(selected.feeCents)}`}
                  tone="good"
                  icon={TrendingUp}
                />
                <KpiCard
                  label="Estornos"
                  value={formatPrice(selected.refundCents)}
                  hint={`${selected.refundedOrders} pedido(s)`}
                  tone="bad"
                  icon={Undo2}
                />
                <KpiCard
                  label="Ingressos pagos"
                  value={selected.paidTickets}
                  hint={`${selected.pendingOrders} pendente(s)`}
                  icon={Ticket}
                />
              </div>

              <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 sm:p-6">
                  <h3 className="text-sm font-medium mb-4">Por lote</h3>
                  <div className="h-64 mb-4">
                    {chartByLote.length === 0 ? (
                      <EmptyState text="Sem vendas por lote neste evento." />
                    ) : Recharts ? (
                      <Recharts.ResponsiveContainer width="100%" height="100%">
                        <Recharts.BarChart data={chartByLote}>
                          <Recharts.CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <Recharts.XAxis dataKey="name" tick={{ fontSize: 11, fill: '#a1a1aa' }} />
                          <Recharts.YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} />
                          <Recharts.Tooltip
                            contentStyle={{
                              background: '#18181b',
                              border: '1px solid #3f3f46',
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                            formatter={(value, name) => {
                              const n = typeof value === 'number' ? value : Number(value) || 0;
                              if (name === 'tickets') return [n, 'Ingressos'];
                              return [
                                n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                                name === 'bruto' ? 'Bruto' : 'Líquido',
                              ];
                            }}
                          />
                          <Recharts.Bar dataKey="bruto" name="Bruto" fill="#22c55e" radius={[4, 4, 0, 0]} />
                          <Recharts.Bar dataKey="liquido" name="Líquido" fill="#34d399" radius={[4, 4, 0, 0]} />
                        </Recharts.BarChart>
                      </Recharts.ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                        Carregando…
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    {selected.byLote.length === 0 && (
                      <p className="text-zinc-500 text-xs">Nenhum lote com movimento.</p>
                    )}
                    {selected.byLote.map((l) => (
                      <div
                        key={l.name}
                        className="flex justify-between gap-3 border-b border-white/5 pb-2"
                      >
                        <div>
                          <div className="font-medium">{l.name}</div>
                          <div className="text-[11px] text-zinc-500">
                            {l.paidTickets} ing. · {l.paidOrders} pedido(s)
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div>{formatPrice(l.grossCents)}</div>
                          <div className="text-[11px] text-emerald-400">{formatPrice(l.netCents)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 sm:p-6">
                  <h3 className="text-sm font-medium mb-4">Por tipo de ingresso</h3>
                  {selected.byTicketType.filter((t) => t.paidTickets > 0).length === 0 ? (
                    <EmptyState text="Nenhum ingresso pago neste evento." />
                  ) : (
                    <div className="space-y-3">
                      {selected.byTicketType
                        .filter((t) => t.paidTickets > 0)
                        .map((t) => (
                          <div
                            key={t.name}
                            className="flex justify-between gap-3 border-b border-white/5 pb-3"
                          >
                            <div>
                              <div className="font-medium text-sm">{t.name}</div>
                              <div className="text-[11px] text-zinc-500">{t.paidTickets} vendido(s)</div>
                            </div>
                            <div className="text-sm tabular-nums">{formatPrice(t.grossCents)}</div>
                          </div>
                        ))}
                    </div>
                  )}

                  {selected.catalog.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-white/10">
                      <h4 className="text-[11px] uppercase tracking-wide text-zinc-500 mb-3">
                        Estoque (catálogo)
                      </h4>
                      <div className="space-y-2 text-xs">
                        {selected.catalog.map((tt) => {
                          const pct =
                            tt.totalQty > 0 ? Math.min(100, Math.round((tt.sold / tt.totalQty) * 100)) : 0;
                          return (
                            <div key={tt.id}>
                              <div className="flex justify-between gap-2 mb-1">
                                <span className="text-zinc-300 truncate">{tt.name}</span>
                                <span className="text-zinc-500 tabular-nums shrink-0">
                                  {tt.sold}/{tt.totalQty} ({pct}%)
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500/80"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
