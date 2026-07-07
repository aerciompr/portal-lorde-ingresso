'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { toast } from 'sonner';

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

export default function AdminPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'refunded' | 'pending'>('all');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/orders');
    if (res.ok) setOrders(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredOrders = orders
    .filter(o => {
      const matchesSearch = o.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.buyerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.event.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .slice(0, 100);

  async function refund(orderId: string) {
    if (!confirm('Confirmar estorno real via gateway?')) return;
    const res = await fetch('/api/admin/refund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
    const data = await res.json();
    if (res.ok) { toast.success('Estorno processado'); load(); } else toast.error(data.error);
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-zinc-400">Busque, filtre e realize estornos reais via gateways configurados.</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input className="input w-full max-w-xs" placeholder="Buscar por nome, email ou evento..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <select className="input w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
          <option value="all">Todos os status</option>
          <option value="paid">Pagos</option>
          <option value="refunded">Estornados</option>
          <option value="pending">Pendentes</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-left text-zinc-400 border-b border-white/10">
            <tr>
              <th className="p-3">Cliente</th><th>Evento</th><th>Lote</th><th>Bruto</th><th>Líquido</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredOrders.map(o => (
              <tr key={o.id} className="hover:bg-white/5">
                <td className="p-3">{o.buyerName}<br/><span className="text-xs text-zinc-500">{o.buyerEmail}</span></td>
                <td>{o.event.title}</td>
                <td className="text-xs">{o.lote?.nome || '—'}</td>
                <td>{formatPrice(o.grossCents || o.totalCents)}</td>
                <td className="text-emerald-400">{formatPrice(o.netCents || 0)}</td>
                <td><StatusBadge status={o.status} /></td>
                <td>{o.status === 'paid' && <button onClick={() => refund(o.id)} className="text-xs bg-red-600/70 px-3 py-1 rounded cursor-pointer">Estornar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
