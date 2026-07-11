'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { toast } from 'sonner';
import PeriodFilter from '@/components/PeriodFilter';
import StatusBadge from '@/components/StatusBadge';
import {
  endOfLocalDay,
  periodToRange,
  startOfLocalDay,
  type PeriodId,
} from '@/lib/period';
import { summarizeOrders } from '@/lib/order-metrics';

export const dynamic = 'force-dynamic';

type RechartsModule = typeof import('recharts');

interface Order {
  id: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  status: string;
  grossCents?: number;
  netCents?: number;
  createdAt?: string;
  paidAt?: string | null;
  event: { title: string };
  lote?: { nome: string } | null;
  tickets?: { id: string; status?: string }[];
}

function orderWhen(o: Order): Date {
  if (o.paidAt) return new Date(o.paidAt);
  if (o.createdAt) return new Date(o.createdAt);
  return new Date(0);
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState<PeriodId>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [Recharts, setRecharts] = useState<RechartsModule | null>(null);

  useEffect(() => {
    import('recharts').then(setRecharts).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/orders?limit=500');
    if (res.ok) setOrders(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const periodRange = useMemo(() => {
    const r = periodToRange(period, customFrom, customTo);
    return {
      from: r.from ? startOfLocalDay(new Date(r.from + 'T12:00:00')) : null,
      to: r.to ? endOfLocalDay(new Date(r.to + 'T12:00:00')) : null,
    };
  }, [period, customFrom, customTo]);

  const dash = useMemo(() => {
    const scoped = orders.filter((o) => {
      if (!periodRange.from && !periodRange.to) return true;
      const t = orderWhen(o).getTime();
      if (periodRange.from && t < periodRange.from.getTime()) return false;
      if (periodRange.to && t > periodRange.to.getTime()) return false;
      return true;
    });

    const metrics = summarizeOrders(scoped);
    const paid = scoped.filter((o) => (o.status || '').toLowerCase() === 'paid');
    const refunded = scoped.filter((o) => (o.status || '').toLowerCase() === 'refunded');
    const pending = scoped.filter((o) => (o.status || '').toLowerCase() === 'pending');
    const cancelled = scoped.filter((o) => {
      const s = (o.status || '').toLowerCase();
      return s === 'cancelled' || s === 'canceled';
    });

    const byEventTitle: Record<string, number> = {};
    for (const o of paid) {
      const n = o.tickets?.filter((t) => t.status !== 'cancelled').length || 1;
      byEventTitle[o.event.title] = (byEventTitle[o.event.title] || 0) + n;
    }
    const chartData = Object.entries(byEventTitle)
      .map(([title, ingressos]) => ({
        name: title.length > 18 ? title.slice(0, 15) + '…' : title,
        fullName: title,
        ingressos,
      }))
      .sort((a, b) => b.ingressos - a.ingressos)
      .slice(0, 8);

    const statusData = [
      { name: 'Pagos', value: paid.length, color: '#22c55e' },
      { name: 'Estornados', value: refunded.length, color: '#ef4444' },
      { name: 'Pendentes', value: pending.length, color: '#eab308' },
      { name: 'Cancelados', value: cancelled.length, color: '#71717a' },
    ].filter((d) => d.value > 0);

    return {
      ...metrics,
      chartData,
      statusData,
      recent: [...scoped]
        .sort((a, b) => orderWhen(b).getTime() - orderWhen(a).getTime())
        .slice(0, 10),
    };
  }, [orders, periodRange]);

  async function cleanupPendings() {
    if (
      !confirm(
        'Cancelar pedidos pendentes com mais de 30 minutos e devolver estoque?\n\n' +
          'Isso limpa reservas abandonadas no checkout.'
      )
    ) {
      return;
    }
    setCleaning(true);
    try {
      const res = await fetch('/api/admin/orders/cleanup-pending', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na limpeza');
      toast.success(data.message || 'Limpeza concluída');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter">Portal Admin</h1>
          <p className="text-zinc-500 text-sm">Lorde Nelson Pub • Maceió</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/reports" className="btn text-sm">
            Relatórios
          </a>
          <a href="/admin/pedidos" className="btn text-sm">
            Pedidos
          </a>
          <a href="/checkin" target="_blank" className="btn text-sm">
            Check-in
          </a>
        </div>
      </div>

      <div className="mb-6 p-4 border border-emerald-900/50 bg-emerald-950/30 rounded-2xl text-sm">
        <div className="flex items-center gap-2 mb-1">
          <span>📱</span>
          <span className="font-medium text-emerald-400">App Mobile (Check-in)</span>
        </div>
        <a
          href="/checkin"
          target="_blank"
          className="inline-block text-emerald-400 hover:underline font-mono text-xs"
        >
          /checkin
        </a>
        <div className="text-[10px] mt-1 text-zinc-500">
          Login de staff (mesmo do Admin). Eventos, pedidos e configs nas páginas do menu lateral.
        </div>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <PeriodFilter
          period={period}
          onPeriodChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
        {dash.pendingCount > 0 && (
          <button
            type="button"
            disabled={cleaning}
            onClick={cleanupPendings}
            className="text-xs px-3 py-2 rounded-xl border border-amber-500/30 text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
          >
            {cleaning
              ? 'Limpando…'
              : `Limpar pendentes antigos (${dash.pendingCount} no período)`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Bruto (pagos)</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1">
            {formatPrice(dash.totalBruto)}
          </div>
          <div className="text-[10px] text-zinc-600 mt-1">{dash.paidCount} pedido(s)</div>
        </div>
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Líquido (pagos)</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1 text-emerald-400">
            {formatPrice(dash.totalLiquido)}
          </div>
        </div>
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Estornos (à parte)</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1 text-red-400">
            {formatPrice(dash.totalEstornos)}
          </div>
          <div className="text-[10px] text-zinc-600 mt-1">Não somam no bruto</div>
        </div>
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Ingressos pagos</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1">{dash.paidTickets}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        <div className="card p-6 md:col-span-3">
          <div className="font-semibold mb-4">Vendas por evento (só pagos)</div>
          <div className="h-[260px]">
            {dash.chartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">
                Nenhuma venda paga neste período
              </div>
            ) : Recharts ? (
              <Recharts.ResponsiveContainer width="100%" height="100%">
                <Recharts.BarChart data={dash.chartData}>
                  <Recharts.XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <Recharts.YAxis allowDecimals={false} />
                  <Recharts.Tooltip
                    labelFormatter={(_, p) =>
                      (p?.[0]?.payload as { fullName?: string })?.fullName || ''
                    }
                  />
                  <Recharts.Bar dataKey="ingressos" fill="#10b981" radius={3} />
                </Recharts.BarChart>
              </Recharts.ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">
                Carregando gráfico...
              </div>
            )}
          </div>
        </div>

        <div className="card p-6 md:col-span-2">
          <div className="font-semibold mb-4">Status dos pedidos</div>
          <div className="h-[260px] flex items-center justify-center">
            {dash.statusData.length > 0 && Recharts ? (
              <Recharts.ResponsiveContainer width="100%" height="100%">
                <Recharts.PieChart>
                  <Recharts.Pie
                    data={dash.statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                  >
                    {dash.statusData.map((entry, index) => (
                      <Recharts.Cell key={index} fill={entry.color} />
                    ))}
                  </Recharts.Pie>
                  <Recharts.Tooltip />
                </Recharts.PieChart>
              </Recharts.ResponsiveContainer>
            ) : (
              <div className="text-zinc-500 text-sm">Sem dados no período</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="font-semibold mb-3">Pedidos recentes (período)</h3>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-white/10">
                <th className="p-3">Cliente</th>
                <th>Evento</th>
                <th>Lote</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dash.recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-zinc-500">
                    Nenhum pedido neste período
                  </td>
                </tr>
              ) : (
                dash.recent.map((o) => {
                  const empty =
                    !o.buyerEmail?.trim() ||
                    !o.buyerName?.trim() ||
                    o.buyerName === 'Checkout em andamento';
                  return (
                    <tr key={o.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3">
                        {empty && o.status === 'pending' ? (
                          <span className="text-amber-400/90 italic text-xs">
                            Sem cliente (checkout)
                          </span>
                        ) : (
                          o.buyerName || '—'
                        )}
                        <span className="text-xs text-zinc-500 block">
                          {o.buyerEmail?.trim() || '—'}
                        </span>
                      </td>
                      <td>{o.event.title}</td>
                      <td className="text-xs">{o.lote?.nome || '—'}</td>
                      <td>{formatPrice(o.grossCents || o.totalCents)}</td>
                      <td>
                        <StatusBadge status={o.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">
          Pendente sem e-mail = checkout abandonado. Use limpeza ou configure o cron.
        </p>
      </div>
    </div>
  );
}
