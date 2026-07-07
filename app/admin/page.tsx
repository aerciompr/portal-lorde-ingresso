'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatPrice, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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
  event: { title: string };
  lote?: { nome: string } | null;
}

type AdminSection = 'dashboard' | 'eventos' | 'pedidos' | 'lotes' | 'config';

export default function AdminPortal() {
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [events, setEvents] = useState<Event[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'refunded' | 'pending'>('all');

  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [loteEventId, setLoteEventId] = useState('');
  const [editingLote, setEditingLote] = useState<any>(null);

  const [newEvent, setNewEvent] = useState({ title: '', date: '', price: '3500', qty: '150', description: '', imageUrl: '', address: '', location: '', cancelHours: '24', cancelFee: '10' });
  const [loteForm, setLoteForm] = useState({ nome: '', preco: '3000', qty: '50' });

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

  const paidOrders = orders.filter(o => o.status === 'paid');
  const totalBruto = orders.reduce((s, o) => s + (o.grossCents || o.totalCents), 0);
  const totalLiquido = orders.reduce((s, o) => s + (o.netCents || 0), 0);
  const totalEstornos = orders.filter(o => o.status === 'refunded').reduce((s, o) => s + (o.grossCents || o.totalCents), 0);

  const filteredOrders = orders
    .filter(o => {
      const matchesSearch = o.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.buyerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.event.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .slice(0, 60);

  const chartData = events.slice(0, 6).map(ev => ({
    name: ev.title.length > 18 ? ev.title.slice(0, 15) + '...' : ev.title,
    ingressos: ev.ticketTypes.reduce((s, t) => s + t.sold, 0),
  }));

  const statusData = [
    { name: 'Pagos', value: paidOrders.length, color: '#22c55e' },
    { name: 'Estornados', value: orders.filter(o => o.status === 'refunded').length, color: '#ef4444' },
    { name: 'Pendentes', value: orders.filter(o => o.status === 'pending').length, color: '#eab308' },
  ].filter(d => d.value > 0);

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
    };
    return <span className={`px-2 py-0.5 rounded text-xs ${colors[status] || 'bg-zinc-700'}`}>{status}</span>;
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

      {/* DASHBOARD */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Bruto Total</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1">{formatPrice(totalBruto)}</div>
        </div>
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Líquido Total</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1 text-emerald-400">{formatPrice(totalLiquido)}</div>
        </div>
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Estornos</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1 text-red-400">{formatPrice(totalEstornos)}</div>
        </div>
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Ingressos Vendidos</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1">{paidOrders.length}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        <div className="card p-6 md:col-span-3">
          <div className="font-semibold mb-4">Vendas por Evento</div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="ingressos" fill="#10b981" radius={3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6 md:col-span-2">
          <div className="font-semibold mb-4">Status dos Pedidos</div>
          <div className="h-[260px] flex items-center justify-center">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                    {statusData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="text-zinc-500">Sem dados</div>}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="font-semibold mb-3">Pedidos Recentes</h3>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-white/10">
                <th className="p-3">Cliente</th><th>Evento</th><th>Lote</th><th>Valor</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 8).map(o => (
                <tr key={o.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3">{o.buyerName} <span className="text-xs text-zinc-500 block">{o.buyerEmail}</span></td>
                  <td>{o.event.title}</td>
                  <td className="text-xs">{o.lote?.nome || '—'}</td>
                  <td>{formatPrice(o.grossCents || o.totalCents)}</td>
                  <td><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
