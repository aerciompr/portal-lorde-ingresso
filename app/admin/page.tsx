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
  const [syncingStripe, setSyncingStripe] = useState(false);
  const [cronInfo, setCronInfo] = useState<{
    cronSecretConfigured?: boolean;
    lastRunAt?: string | null;
    lastRunSource?: string | null;
    pendingCount?: number;
    pendingOlderThanTtl?: number;
    pendingOrderTtlMinutes?: number;
    endpoints?: { sync?: string; cleanup?: string };
  } | null>(null);
  const [cronLastResult, setCronLastResult] = useState<{
    ok: boolean;
    message: string;
    ranAt?: string;
    details?: string[];
  } | null>(null);
  const [Recharts, setRecharts] = useState<RechartsModule | null>(null);
  const [lowStock, setLowStock] = useState<{
    items: Array<{
      id: string;
      nome: string;
      remaining: number;
      totalQty: number;
      sold: number;
      eventTitle: string;
      eventSlug: string;
      level: 'critical' | 'low' | 'soldout';
      emailAlerted: boolean;
    }>;
    warnAt: number;
    emailAt: number;
    alertEmail: string | null;
    counts: { total: number; critical: number; low: number };
  } | null>(null);
  const [viradas, setViradas] = useState<{
    items: Array<{
      id: string;
      eventId: string;
      eventTitle: string;
      fromLoteNome: string | null;
      toLoteNome: string;
      precoCents: number;
      source: string;
      createdAt: string;
    }>;
    error?: string;
  } | null>(null);
  const [loteTab, setLoteTab] = useState<'stock' | 'viradas'>('stock');

  useEffect(() => {
    import('recharts').then(setRecharts).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/orders?limit=500');
    if (res.ok) setOrders(await res.json());
  }, []);

  const loadCron = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cron-status', { credentials: 'include' });
      if (res.ok) setCronInfo(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const loadLowStock = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/lotes/low-stock', { credentials: 'include' });
      if (res.ok) setLowStock(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const loadViradas = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/lotes/viradas?limit=8', { credentials: 'include' });
      if (res.ok) setViradas(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadCron();
    loadLowStock();
    loadViradas();
  }, [load, loadCron, loadLowStock, loadViradas]);

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
    const ttl = cronInfo?.pendingOrderTtlMinutes ?? 30;
    const eligible = cronInfo?.pendingOlderThanTtl;
    if (
      !confirm(
        `Limpar pendentes com mais de ${ttl} minutos?\n\n` +
          (eligible != null ? `Elegíveis agora: ${eligible}\n\n` : '') +
          '• Devolve estoque\n' +
          '• Repara cancelados com estoque preso\n\n' +
          'O tempo mínimo vem de Configurações → Regras → “Expirar pending”.\n' +
          'Pedidos pagos no Stripe NÃO são cancelados.\n' +
          'Para limpar TODOS os pending (qualquer idade): Ferramentas → Limpeza → minutos 0.'
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
        body: JSON.stringify({
          minutes: ttl,
          repairCancelled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na limpeza');
      toast.success(data.message || 'Limpeza concluída');
      if (data.cleaned === 0 && !data.repair?.fixed) {
        toast.message(
          `Nada com mais de ${ttl} min. Pending mais novos não são limpos (aguarde ou use Ferramentas com minutos 0).`
        );
      }
      load();
      loadCron();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCleaning(false);
    }
  }

  /** Marca como pagos os pending cujo PaymentIntent já succeeded no Stripe */
  async function syncStripePendings() {
    setSyncingStripe(true);
    try {
      const res = await fetch('/api/admin/orders/sync-stripe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na sincronização');
      toast.success(data.message || 'Sincronização concluída');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncingStripe(false);
    }
  }

  async function runAllCrons() {
    if (
      !confirm(
        'Rodar crons agora (Stripe, PIX, limpar pendentes, viradas)?\n\nNão depende de CRON_SECRET externo.'
      )
    ) {
      return;
    }
    setSyncingStripe(true);
    setCronLastResult(null);
    try {
      const res = await fetch('/api/admin/orders/run-crons', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha');

      const cleanup = data.cleanup as
        | { cleaned?: number; ticketsReleased?: number; scanned?: number }
        | undefined;
      const stripe = data.stripe as
        | { finalized?: number; cancelled?: number; feesUpdated?: number }
        | undefined;
      const pix = data.pix as
        | { finalized?: number; cancelled?: number; skipped?: boolean }
        | undefined;
      const loteAlerts = data.loteAlerts as
        | { scanned?: number; emailed?: number; critical?: number }
        | undefined;

      const details = [
        `Stripe: ${stripe?.finalized ?? 0} pagos · ${stripe?.cancelled ?? 0} cancel. · ${stripe?.feesUpdated ?? 0} taxas`,
        pix?.skipped
          ? 'PIX: pulado (token MP ausente)'
          : `PIX: ${pix?.finalized ?? data.pixFinalized ?? 0} pagos · ${pix?.cancelled ?? 0} cancel.`,
        `Cleanup: ${cleanup?.cleaned ?? 0} cancelados · ${cleanup?.ticketsReleased ?? 0} ingressos liberados · varridos ${cleanup?.scanned ?? '—'}`,
        `Viradas de lote: ${data.viradas ?? 0}`,
        loteAlerts
          ? `Alertas estoque: ${loteAlerts.critical ?? 0} críticos · ${loteAlerts.emailed ?? 0} e-mail(s)`
          : null,
      ].filter(Boolean) as string[];

      setCronLastResult({
        ok: true,
        message: data.message || 'Crons executados com sucesso',
        ranAt: data.ranAt || new Date().toISOString(),
        details,
      });
      toast.success('Crons OK — veja o resumo no painel');
      load();
      loadCron();
      loadLowStock();
      loadViradas();
    } catch (e) {
      const msg = (e as Error).message;
      setCronLastResult({ ok: false, message: msg, details: [] });
      toast.error(msg);
    } finally {
      setSyncingStripe(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter">Portal Admin</h1>
          <p className="text-zinc-500 text-sm">Lorde Nelson Pub • Maceió</p>
        </div>
        <div className="btn-row-mobile w-full sm:w-auto">
          <a href="/admin/eventos" className="btn text-sm">
            Eventos
          </a>
          <a href="/admin/pedidos" className="btn text-sm">
            Pedidos
          </a>
          <a href="/admin/reports" className="btn text-sm">
            Relatórios
          </a>
          <a href="/checkin" target="_blank" className="btn text-sm">
            Check-in
          </a>
        </div>
      </div>

      {/* Período + ações (antes dos KPIs) */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <PeriodFilter
          period={period}
          onPeriodChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={syncingStripe}
            onClick={syncStripePendings}
            className="text-xs px-3 py-2 rounded-xl border border-sky-500/30 text-sky-300 hover:bg-sky-950/40 disabled:opacity-50"
            title="Consulta o Stripe: pagos, cancelados e líquido real"
          >
            {syncingStripe ? 'Sincronizando Stripe…' : 'Sincronizar cartão (Stripe)'}
          </button>
          <button
            type="button"
            disabled={syncingStripe}
            onClick={runAllCrons}
            className="text-xs px-3 py-2 rounded-xl border border-violet-500/30 text-violet-300 hover:bg-violet-950/40 disabled:opacity-50"
            title="Executa sync + limpeza como se o cron tivesse rodado"
          >
            Rodar crons agora
          </button>
          {(cronInfo?.pendingOlderThanTtl ?? 0) > 0 || (cronInfo?.pendingCount ?? 0) > 0 ? (
            <button
              type="button"
              disabled={cleaning}
              onClick={cleanupPendings}
              className="text-xs px-3 py-2 rounded-xl border border-amber-500/30 text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
              title={`Só cancela pending com mais de ${cronInfo?.pendingOrderTtlMinutes ?? 30} min (TTL das configurações), não o filtro de período do dashboard`}
            >
              {cleaning
                ? 'Limpando…'
                : `Limpar pendentes (>${cronInfo?.pendingOrderTtlMinutes ?? 30} min: ${cronInfo?.pendingOlderThanTtl ?? 0})`}
            </button>
          ) : null}
        </div>
      </div>

      {/* KPIs no topo (números do dia/período) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-6">
        <div className="card p-3 sm:p-6 min-w-0">
          <div className="text-[10px] sm:text-xs text-zinc-500">Bruto (pagos)</div>
          <div className="text-xl sm:text-4xl font-semibold tracking-tighter mt-1 tabular-nums break-all">
            {formatPrice(dash.totalBruto)}
          </div>
          <div className="text-[10px] text-zinc-600 mt-1">{dash.paidCount} pedido(s)</div>
        </div>
        <div className="card p-3 sm:p-6 min-w-0">
          <div className="text-[10px] sm:text-xs text-zinc-500">Líquido (pagos)</div>
          <div className="text-xl sm:text-4xl font-semibold tracking-tighter mt-1 text-emerald-400 tabular-nums break-all">
            {formatPrice(dash.totalLiquido)}
          </div>
        </div>
        <div className="card p-3 sm:p-6 min-w-0">
          <div className="text-[10px] sm:text-xs text-zinc-500">Estornos</div>
          <div className="text-xl sm:text-4xl font-semibold tracking-tighter mt-1 text-red-400 tabular-nums break-all">
            {formatPrice(dash.totalEstornos)}
          </div>
          <div className="text-[10px] text-zinc-600 mt-1 hidden sm:block">Não somam no bruto</div>
        </div>
        <div className="card p-3 sm:p-6 min-w-0">
          <div className="text-[10px] sm:text-xs text-zinc-500">Ingressos pagos</div>
          <div className="text-xl sm:text-4xl font-semibold tracking-tighter mt-1 tabular-nums">
            {dash.paidTickets}
          </div>
        </div>
      </div>

      {/* Operação: lotes unificados + check-in/crons */}
      <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 lg:items-stretch">
        {/* Lotes: estoque + viradas (abas) */}
        <div className="p-4 border border-amber-500/25 bg-amber-950/15 rounded-2xl text-sm flex flex-col min-h-0">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="font-medium text-amber-100 flex items-center gap-2 text-sm">
                <span>🎟️</span> Operação de lotes
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
                Estoque baixo e viradas · e-mail ≤{lowStock?.emailAt ?? 2}
                {lowStock?.alertEmail ? (
                  <>
                    {' '}
                    → <span className="text-zinc-400 break-all">{lowStock.alertEmail}</span>
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadLowStock();
                void loadViradas();
              }}
              className="text-[10px] px-2 py-0.5 rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 shrink-0"
            >
              Atualizar
            </button>
          </div>

          <div className="flex gap-1 p-0.5 rounded-lg bg-black/30 border border-white/5 mb-3 w-fit">
            <button
              type="button"
              onClick={() => setLoteTab('stock')}
              className={`text-[11px] px-2.5 py-1 rounded-md transition ${
                loteTab === 'stock'
                  ? 'bg-amber-500/20 text-amber-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Estoque
              {lowStock && lowStock.items.length > 0 ? (
                <span className="ml-1 tabular-nums opacity-80">({lowStock.items.length})</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setLoteTab('viradas')}
              className={`text-[11px] px-2.5 py-1 rounded-md transition ${
                loteTab === 'viradas'
                  ? 'bg-sky-500/20 text-sky-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Viradas
              {viradas && viradas.items.length > 0 ? (
                <span className="ml-1 tabular-nums opacity-80">({viradas.items.length})</span>
              ) : null}
            </button>
          </div>

          {loteTab === 'stock' ? (
            !lowStock ? (
              <p className="text-xs text-zinc-500">Carregando…</p>
            ) : lowStock.items.length === 0 ? (
              <p className="text-xs text-emerald-400/90">
                Nenhum lote ativo com ≤{lowStock.warnAt} vagas. Tudo folgado.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 overflow-y-auto max-h-48 lg:max-h-56">
                {lowStock.items.map((item) => {
                  const tone =
                    item.level === 'soldout' || item.level === 'critical'
                      ? 'border-red-500/40 bg-red-950/40'
                      : 'border-amber-500/30 bg-amber-950/30';
                  const chip =
                    item.remaining <= 0
                      ? 'Esgotado'
                      : item.remaining === 1
                        ? '1 resto'
                        : `${item.remaining} restam`;
                  const chipClass =
                    item.remaining <= 2
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-amber-500/20 text-amber-200';
                  return (
                    <a
                      key={item.id}
                      href={`/admin/eventos`}
                      className={`rounded-xl border p-2.5 hover:brightness-110 transition ${tone}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-100 truncate">
                            {item.eventTitle}
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
                            {item.nome}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${chipClass}`}
                        >
                          {chip}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            item.remaining <= 2 ? 'bg-red-500' : 'bg-amber-500'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round((item.sold / Math.max(1, item.totalQty)) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </a>
                  );
                })}
              </div>
            )
          ) : !viradas ? (
            <p className="text-xs text-zinc-500">Carregando…</p>
          ) : viradas.error ? (
            <p className="text-xs text-amber-400/90">{viradas.error}</p>
          ) : viradas.items.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhuma virada registrada ainda.</p>
          ) : (
            <div className="space-y-1.5 overflow-y-auto max-h-48 lg:max-h-56">
              {viradas.items.map((v) => (
                <a
                  key={v.id}
                  href={`/admin/eventos`}
                  className="block rounded-xl border border-sky-500/20 bg-sky-950/30 p-2.5 hover:brightness-110 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-100 truncate">
                        {v.eventTitle}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
                        {v.fromLoteNome || '—'} →{' '}
                        <span className="text-emerald-400">{v.toLoteNome}</span>
                        {' · '}
                        {formatPrice(v.precoCents)}
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-zinc-400">
                      {v.source === 'auto' ? 'auto' : 'manual'}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-1 tabular-nums">
                    {new Date(v.createdAt).toLocaleString('pt-BR', {
                      timeZone: 'America/Maceio',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Check-in + crons compactos */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="p-4 border border-emerald-900/50 bg-emerald-950/30 rounded-2xl text-sm flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <span>📱</span>
              <span className="font-medium text-emerald-400">Check-in</span>
            </div>
            <a
              href="/checkin"
              target="_blank"
              className="inline-block text-emerald-400 hover:underline font-mono text-xs"
            >
              /checkin
            </a>
            <div className="text-[10px] mt-1 text-zinc-500">
              Staff na porta · login no app de check-in
            </div>
          </div>

          <div className="p-4 border border-white/10 bg-zinc-900/80 rounded-2xl text-sm flex flex-col flex-1 min-h-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div className="font-medium text-zinc-200 text-sm">⏱ Crons</div>
              <button
                type="button"
                onClick={() => void loadCron()}
                className="text-[10px] px-2 py-0.5 rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5"
              >
                Atualizar
              </button>
            </div>

            <div className="text-[11px] text-zinc-400 space-y-1">
              <div>
                Secret:{' '}
                {cronInfo?.cronSecretConfigured ? (
                  <span className="text-emerald-400">configurado</span>
                ) : (
                  <span className="text-amber-400">ausente</span>
                )}
              </div>
              <div>
                Última:{' '}
                {cronInfo?.lastRunAt ? (
                  <span className="text-zinc-200">
                    {new Date(cronInfo.lastRunAt).toLocaleString('pt-BR', {
                      timeZone: 'America/Maceio',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                ) : (
                  <span className="text-zinc-500">nunca</span>
                )}
                {cronInfo?.lastRunSource ? (
                  <span className="text-zinc-600"> · {cronInfo.lastRunSource}</span>
                ) : null}
              </div>
              <div>
                Pending:{' '}
                <strong className="text-zinc-200">{cronInfo?.pendingCount ?? '—'}</strong>
                {' · '}
                elegíveis (&gt;{cronInfo?.pendingOrderTtlMinutes ?? 30}m):{' '}
                <strong className="text-amber-300">{cronInfo?.pendingOlderThanTtl ?? '—'}</strong>
              </div>
            </div>

            {cronLastResult && (
              <div
                className={`rounded-lg border p-2 text-[10px] space-y-0.5 ${
                  cronLastResult.ok
                    ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-100'
                    : 'border-red-500/30 bg-red-950/30 text-red-200'
                }`}
              >
                <div className="font-medium">
                  {cronLastResult.ok ? '✓ Teste OK' : '✗ Falha'}
                </div>
                {cronLastResult.details?.slice(0, 3).map((line, i) => (
                  <div key={i} className="text-zinc-400 truncate" title={line}>
                    {line}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                disabled={syncingStripe}
                onClick={runAllCrons}
                className="text-[11px] px-2.5 py-1.5 rounded-xl border border-violet-500/40 text-violet-200 hover:bg-violet-950/40 disabled:opacity-50"
              >
                {syncingStripe ? '…' : 'Rodar crons'}
              </button>
              <button
                type="button"
                disabled={cleaning}
                onClick={cleanupPendings}
                className="text-[11px] px-2.5 py-1.5 rounded-xl border border-amber-500/30 text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
              >
                {cleaning
                  ? '…'
                  : `Limpar (>${cronInfo?.pendingOrderTtlMinutes ?? 30}m)`}
              </button>
            </div>
          </div>
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
