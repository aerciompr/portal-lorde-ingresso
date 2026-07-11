'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { formatPrice, orderStatusLabel, ticketStatusLabel } from '@/lib/utils';
import { toast } from 'sonner';
import { Download, FileText } from 'lucide-react';

interface TicketRow {
  id: string;
  uniqueCode: string;
  status: string;
  ticketType?: { name: string };
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
  tickets?: TicketRow[];
}

export default function AdminPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'refunded' | 'pending' | 'cancelled'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/orders');
    if (res.ok) setOrders(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredOrders = orders
    .filter((o) => {
      const matchesSearch =
        o.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.buyerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.event.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .slice(0, 100);

  async function refund(orderId: string) {
    if (!confirm('Confirmar estorno real via gateway?')) return;
    const res = await fetch('/api/admin/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success('Estorno processado');
      load();
    } else toast.error(data.error);
  }

  async function downloadTicketPdf(ticketId: string, code: string) {
    setDownloadingId(ticketId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/pdf`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Falha ao baixar PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ingresso-${code}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('PDF baixado');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Erro no download');
    } finally {
      setDownloadingId(null);
    }
  }

  async function downloadAllOrderPdfs(order: Order) {
    const tickets = (order.tickets || []).filter((t) => t.status !== 'cancelled');
    if (tickets.length === 0) {
      toast.error('Nenhum ingresso para baixar neste pedido');
      return;
    }
    for (const t of tickets) {
      await downloadTicketPdf(t.id, t.uniqueCode);
    }
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-zinc-400">
          Busque, baixe PDFs de ingressos e realize estornos via gateways.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          className="input w-full max-w-xs"
          placeholder="Buscar por nome, email ou evento..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="input w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="all">Todos os status</option>
          <option value="paid">Pagos</option>
          <option value="refunded">Estornados</option>
          <option value="pending">Pendentes</option>
          <option value="cancelled">Cancelados</option>
        </select>
        <a href="/admin/ingresso-preview" className="btn btn-secondary text-sm inline-flex items-center gap-1.5">
          <FileText size={14} /> Layout + PDF exemplo
        </a>
        <a href="/admin/ferramentas" className="btn btn-secondary text-sm">
          Ferramentas
        </a>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="text-left text-zinc-400 border-b border-white/10">
            <tr>
              <th className="p-3">Cliente</th>
              <th>Evento</th>
              <th>Lote</th>
              <th>Bruto</th>
              <th>Líquido</th>
              <th>Status</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredOrders.map((o) => {
              const canPdf = o.status === 'paid' && (o.tickets?.length || 0) > 0;
              const isOpen = expandedId === o.id;
              return (
                <Fragment key={o.id}>
                  <tr className="hover:bg-white/5">
                    <td className="p-3">
                      {o.buyerName || '—'}
                      <br />
                      <span className="text-xs text-zinc-500">{o.buyerEmail || '—'}</span>
                    </td>
                    <td>{o.event.title}</td>
                    <td className="text-xs">{o.lote?.nome || '—'}</td>
                    <td>{formatPrice(o.grossCents || o.totalCents)}</td>
                    <td className="text-emerald-400">{formatPrice(o.netCents || 0)}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {canPdf && (
                          <>
                            <button
                              type="button"
                              onClick={() => setExpandedId(isOpen ? null : o.id)}
                              className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 cursor-pointer"
                            >
                              {isOpen ? 'Ocultar' : `Ingressos (${o.tickets!.length})`}
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadAllOrderPdfs(o)}
                              className="text-xs px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 cursor-pointer inline-flex items-center gap-1"
                            >
                              <Download size={12} /> PDF
                            </button>
                          </>
                        )}
                        {o.status === 'paid' && (
                          <button
                            type="button"
                            onClick={() => refund(o.id)}
                            className="text-xs bg-red-600/70 px-3 py-1 rounded cursor-pointer"
                          >
                            Estornar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && canPdf && (
                    <tr className="bg-zinc-950/50">
                      <td colSpan={7} className="p-3">
                        <div className="text-xs text-zinc-500 mb-2">Ingressos deste pedido</div>
                        <ul className="space-y-1.5">
                          {o.tickets!.map((t) => (
                            <li
                              key={t.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-1.5 px-2 rounded-lg border border-white/5"
                            >
                              <span>
                                <span className="text-zinc-300">{t.ticketType?.name || 'Ingresso'}</span>
                                {' · '}
                                <code className="font-mono text-emerald-400/90">{t.uniqueCode}</code>
                                <span className="text-zinc-600 ml-2">({ticketStatusLabel(t.status)})</span>
                              </span>
                              <button
                                type="button"
                                disabled={downloadingId === t.id || t.status === 'cancelled'}
                                onClick={() => downloadTicketPdf(t.id, t.uniqueCode)}
                                className="text-xs px-2.5 py-1 rounded bg-emerald-600/70 hover:bg-emerald-600 disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
                              >
                                <Download size={12} />
                                {downloadingId === t.id ? '...' : 'Baixar PDF'}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
