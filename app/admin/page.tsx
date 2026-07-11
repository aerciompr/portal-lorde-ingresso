'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPrice, formatDate, orderStatusLabel } from '@/lib/utils';
import { toast } from 'sonner';

export const dynamic = 'force-dynamic';

type RechartsModule = typeof import('recharts');

interface Event {
  id: string;
  slug: string;
  title: string;
  date: string;
  ticketTypes: { id: string; name: string; priceCents: number; totalQty: number; sold: number }[];
  lotes?: { id: string; nome: string; precoCents: number; totalQty: number; sold: number; viradaAutomatica: boolean; ativo: boolean }[];
  activeLote?: { id: string; nome: string; precoCents: number } | null;
}

interface Order {
  id: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  status: string;
  paymentMethod?: string;
  paymentGateway?: string;
  grossCents?: number;
  netCents?: number;
  feeCents?: number;
  createdAt?: string;
  paidAt?: string | null;
  event: { title: string };
  lote?: { nome: string } | null;
  tickets?: { id: string; status?: string }[];
}

type PeriodId = 'today' | '7d' | '15d' | '30d' | 'all' | 'custom';

type AdminSection = 'dashboard' | 'eventos' | 'pedidos' | 'lotes' | 'config';

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Data do pedido para filtros: paidAt se pago, senão createdAt */
function orderWhen(o: Order): Date {
  if (o.paidAt) return new Date(o.paidAt);
  if (o.createdAt) return new Date(o.createdAt);
  return new Date(0);
}

export default function AdminPortal() {
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [events, setEvents] = useState<Event[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'refunded' | 'pending'>('all');
  const [period, setPeriod] = useState<PeriodId>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [cleaning, setCleaning] = useState(false);

  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [loteEventId, setLoteEventId] = useState('');
  const [editingLote, setEditingLote] = useState<any>(null);

  const [newEvent, setNewEvent] = useState({ title: '', date: '', price: '3500', qty: '150', description: '', imageUrl: '', address: '', location: '', cancelHours: '24', cancelFee: '10' });
  const [loteForm, setLoteForm] = useState({ nome: '', preco: '3000', qty: '50' });
  const [Recharts, setRecharts] = useState<RechartsModule | null>(null);

  useEffect(() => {
    // Lazy load Recharts to reduce initial RAM and startup time
    import('recharts').then(setRecharts);
  }, []);

  const load = useCallback(async () => {
    const [evRes, ordRes, setRes] = await Promise.all([
      fetch('/api/admin/events'),
      fetch('/api/admin/orders'),
      fetch('/api/admin/settings'),
    ]);
    if (evRes.ok) setEvents(await evRes.json());
    if (ordRes.ok) setOrders(await ordRes.json());
    if (setRes.ok) setSettings(await setRes.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const periodRange = useMemo(() => {
    const now = new Date();
    if (period === 'all') return { from: null as Date | null, to: null as Date | null };
    if (period === 'today') return { from: startOfLocalDay(now), to: endOfLocalDay(now) };
    if (period === 'custom') {
      const from = customFrom ? startOfLocalDay(new Date(customFrom + 'T12:00:00')) : null;
      const to = customTo ? endOfLocalDay(new Date(customTo + 'T12:00:00')) : null;
      return { from, to };
    }
    const days = period === '7d' ? 7 : period === '15d' ? 15 : 30;
    const from = startOfLocalDay(new Date(now.getTime() - (days - 1) * 86400000));
    return { from, to: endOfLocalDay(now) };
  }, [period, customFrom, customTo]);

  const inPeriod = useCallback(
    (o: Order) => {
      if (!periodRange.from && !periodRange.to) return true;
      const t = orderWhen(o).getTime();
      if (periodRange.from && t < periodRange.from.getTime()) return false;
      if (periodRange.to && t > periodRange.to.getTime()) return false;
      return true;
    },
    [periodRange]
  );

  /** Resumo: bruto/líquido/ingressos = só PAGOS no período. Estornos à parte (não entram no bruto). */
  const dash = useMemo(() => {
    const scoped = orders.filter(inPeriod);
    const paid = scoped.filter((o) => (o.status || '').toLowerCase() === 'paid');
    const refunded = scoped.filter((o) => (o.status || '').toLowerCase() === 'refunded');
    const pending = scoped.filter((o) => (o.status || '').toLowerCase() === 'pending');
    const cancelled = scoped.filter((o) => {
      const s = (o.status || '').toLowerCase();
      return s === 'cancelled' || s === 'canceled';
    });

    const totalBruto = paid.reduce((s, o) => s + (o.grossCents || o.totalCents || 0), 0);
    const totalLiquido = paid.reduce((s, o) => s + (o.netCents || 0), 0);
    const totalEstornos = refunded.reduce((s, o) => s + (o.grossCents || o.totalCents || 0), 0);
    const paidTickets = paid.reduce(
      (s, o) => s + (o.tickets?.filter((t) => t.status !== 'cancelled').length || 0),
      0
    );
    // fallback se API não mandar tickets
    const ingressosVendidos = paidTickets > 0 ? paidTickets : paid.length;

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
      totalBruto,
      totalLiquido,
      totalEstornos,
      ingressosVendidos,
      paidCount: paid.length,
      pendingCount: pending.length,
      chartData,
      statusData,
      recent: [...scoped].sort((a, b) => orderWhen(b).getTime() - orderWhen(a).getTime()).slice(0, 10),
    };
  }, [orders, inPeriod]);

  const filteredOrders = orders
    .filter(o => {
      const matchesSearch = o.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.buyerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.event.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .slice(0, 60);

  async function cleanupPendings() {
    if (
      !confirm(
        'Cancelar pedidos pendentes com mais de 30 minutos e devolver estoque?\n\n' +
          'Isso limpa reservas abandonadas no checkout (sem nome/e-mail).'
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

  async function createOrUpdateEvent() {
    const payload: any = {
      ...(editingEvent && { id: editingEvent.id }),
      title: newEvent.title,
      date: newEvent.date,
      priceCents: parseInt(newEvent.price),
      qty: parseInt(newEvent.qty),
      description: newEvent.description,
      imageUrl: newEvent.imageUrl,
      address: newEvent.address,
      location: newEvent.location,
      cancelHoursBefore: parseInt(newEvent.cancelHours),
      cancelFeePercent: parseFloat(newEvent.cancelFee),
    };

    const method = editingEvent ? 'PUT' : 'POST';
    const res = await fetch('/api/admin/events', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(editingEvent ? 'Evento atualizado' : 'Evento criado');
      closeEventModal();
      load();
    } else toast.error('Erro ao salvar evento');
  }

  function openCreateEvent() {
    setEditingEvent(null);
    setNewEvent({ title: '', date: '', price: '3500', qty: '150', description: '', imageUrl: '', address: '', location: '', cancelHours: '24', cancelFee: '10' });
    setShowEventModal(true);
  }

  function openEditEvent(ev: any) {
    setEditingEvent(ev);
    setNewEvent({
      title: ev.title,
      date: new Date(ev.date).toISOString().slice(0, 16),
      price: (ev.ticketTypes[0]?.priceCents || 3500).toString(),
      qty: (ev.ticketTypes[0]?.totalQty || 150).toString(),
      description: ev.description || '',
      imageUrl: ev.imageUrl || '',
      address: ev.address || '',
      location: ev.location || '',
      cancelHours: (ev.cancelHoursBefore || 24).toString(),
      cancelFee: (ev.cancelFeePercent || 10).toString(),
    });
    setShowEventModal(true);
  }

  function closeEventModal() {
    setShowEventModal(false);
    setEditingEvent(null);
  }

  async function virarLote(eventId: string) {
    setLoteEventId(eventId);
    setLoteForm({ nome: `Lote ${Date.now() % 100}`, preco: '3000', qty: '50' });
    setShowLoteModal(true);
  }

  async function submitLoteAction() {
    if (!loteEventId) return;

    if (editingLote) {
      // Edit existing lote
      const res = await fetch('/api/admin/lotes/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingLote.id,
          precoCents: parseInt(loteForm.preco),
          totalQty: parseInt(loteForm.qty),
        }),
      });
      if (res.ok) {
        toast.success('Lote atualizado');
        closeLoteModal();
        load();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erro');
      }
    } else {
      // Virar (create next)
      const res = await fetch('/api/admin/lotes/virar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: loteEventId,
          newNome: loteForm.nome,
          newPreco: parseInt(loteForm.preco),
          newQty: parseInt(loteForm.qty),
        }),
      });
      if (res.ok) {
        toast.success('Lote virado com sucesso');
        closeLoteModal();
        load();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erro');
      }
    }
  }

  function openEditLote(lote: any, eventId: string) {
    setLoteEventId(eventId);
    setEditingLote(lote);
    setLoteForm({
      nome: lote.nome,
      preco: lote.precoCents.toString(),
      qty: lote.totalQty.toString(),
    });
    setShowLoteModal(true);
  }

  function closeLoteModal() {
    setShowLoteModal(false);
    setEditingLote(null);
    setLoteEventId('');
  }

  async function refund(orderId: string) {
    if (!confirm('Confirmar estorno real via gateway?')) return;
    const res = await fetch('/api/admin/refund', { method: 'POST', body: JSON.stringify({ orderId }) });
    const data = await res.json();
    if (res.ok) { toast.success('Estorno processado'); load(); } else toast.error(data.error);
  }

  async function saveSettings() {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    toast.success('Configurações salvas no banco');
    load();
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      paid: 'bg-emerald-500/20 text-emerald-400',
      refunded: 'bg-red-500/20 text-red-400',
      pending: 'bg-yellow-500/20 text-yellow-400',
      cancelled: 'bg-zinc-600/40 text-zinc-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs ${colors[status] || 'bg-zinc-700'}`}>
        {orderStatusLabel(status)}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter">Portal Admin</h1>
          <p className="text-zinc-500 text-sm">Lorde Nelson Pub • Maceió</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/reports" className="btn text-sm">Relatórios</a>
          <a href="/checkin" target="_blank" className="btn text-sm">Check-in (App Mobile)</a>
        </div>
      </div>

      {/* Direct Mobile App Link for Staff */}
      <div className="mb-6 p-4 border border-emerald-900/50 bg-emerald-950/30 rounded-2xl text-sm">
        <div className="flex items-center gap-2 mb-1">
          <span>📱</span>
          <span className="font-medium text-emerald-400">Link Direto App Mobile (Check-in)</span>
        </div>
        <div className="text-xs text-zinc-400 mb-2">
          Para staff no celular: abra este link e adicione à tela inicial (Add to Home Screen). Funciona como um app dedicado.
        </div>
        <a href="/checkin" target="_blank" className="inline-block text-emerald-400 hover:underline font-mono text-xs break-all">
          /checkin
        </a>
        <div className="text-[10px] mt-1 text-zinc-500">Requer login de funcionário (mesmo do Admin). Protegido por sessão.</div>
      </div>

      {/* Filtro de período */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Período do resumo</div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['today', 'Hoje'],
                ['7d', '7 dias'],
                ['15d', '15 dias'],
                ['30d', '30 dias'],
                ['all', 'Tudo'],
                ['custom', 'Personalizado'],
              ] as [PeriodId, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPeriod(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  period === id
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'border-white/10 text-zinc-400 hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap gap-2 mt-2">
              <label className="text-xs text-zinc-500 flex items-center gap-1.5">
                De
                <input
                  type="date"
                  className="input py-1 text-xs"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="text-xs text-zinc-500 flex items-center gap-1.5">
                Até
                <input
                  type="date"
                  className="input py-1 text-xs"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </div>
          )}
          <p className="text-[11px] text-zinc-600 mt-2">
            Bruto e líquido = só pedidos <strong className="text-zinc-400">pagos</strong>. Estornos não entram no bruto.
          </p>
        </div>
        {dash.pendingCount > 0 && (
          <button
            type="button"
            disabled={cleaning}
            onClick={cleanupPendings}
            className="text-xs px-3 py-2 rounded-xl border border-amber-500/30 text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
          >
            {cleaning ? 'Limpando…' : `Limpar pendentes antigos (${dash.pendingCount} no período)`}
          </button>
        )}
      </div>

      {/* DASHBOARD KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Bruto (pagos)</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1">{formatPrice(dash.totalBruto)}</div>
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
          <div className="text-4xl font-semibold tracking-tighter mt-1">{dash.ingressosVendidos}</div>
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
                    labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName || ''}
                  />
                  <Recharts.Bar dataKey="ingressos" fill="#10b981" radius={3} />
                </Recharts.BarChart>
              </Recharts.ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">Carregando gráfico...</div>
            )}
          </div>
        </div>

        <div className="card p-6 md:col-span-2">
          <div className="font-semibold mb-4">Status dos pedidos</div>
          <div className="h-[260px] flex items-center justify-center">
            {dash.statusData.length > 0 ? (
              Recharts ? (
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
                <div className="text-zinc-500">Sem dados</div>
              )
            ) : (
              <div className="text-zinc-500">Sem dados no período</div>
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
                dash.recent.map((o) => (
                  <tr key={o.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3">
                      {o.buyerName?.trim() || (
                        <span className="text-zinc-500 italic">Sem dados (checkout)</span>
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
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">
          Pedido pendente sem nome = alguém abriu o checkout e não pagou. O cron limpa após ~30 min se
          estiver configurado; ou use o botão acima.
        </p>
      </div>
    </div>
  );
}
