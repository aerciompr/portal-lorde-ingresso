'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatPrice, formatDate, centsToInput, parseBRLToCents } from '@/lib/utils';
import { toast } from 'sonner';
import { Edit, Copy, Trash2, Plus, Ticket, ArrowRightLeft, Settings2, ExternalLink } from 'lucide-react';

interface Event {
  id: string;
  slug: string;
  title: string;
  date: string;
  description?: string;
  imageUrl?: string;
  address?: string;
  location?: string;
  footerNotice?: string | null;
  cancelHoursBefore?: number;
  cancelFeePercent?: number;
  ticketTypes: { id: string; name: string; priceCents: number; totalQty: number; sold: number }[];
  lotes?: {
    id: string;
    nome: string;
    precoCents: number;
    totalQty: number;
    sold: number;
    viradaAutomatica: boolean;
    ativo: boolean;
  }[];
  activeLote?: { id: string; nome: string; precoCents: number } | null;
}

export default function AdminEventos() {
  const [events, setEvents] = useState<Event[]>([]);
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [loteEventId, setLoteEventId] = useState('');
  const [editingLote, setEditingLote] = useState<{
    id: string;
    nome: string;
    precoCents: number;
    totalQty: number;
  } | null>(null);
  const [loteForm, setLoteForm] = useState({ nome: '', preco: '30,00', qty: '50' });

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/events');
    if (res.ok) setEvents(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitLoteAction() {
    if (!loteEventId || !editingLote) return;

    const res = await fetch('/api/admin/lotes/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingLote.id,
        precoCents: parseBRLToCents(loteForm.preco),
        totalQty: parseInt(loteForm.qty, 10),
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
  }

  function openEditLote(
    lote: { id: string; nome: string; precoCents: number; totalQty: number },
    eventId: string
  ) {
    setLoteEventId(eventId);
    setEditingLote(lote);
    setLoteForm({
      nome: lote.nome,
      preco: centsToInput(lote.precoCents),
      qty: lote.totalQty.toString(),
    });
    setShowLoteModal(true);
  }

  function closeLoteModal() {
    setShowLoteModal(false);
    setEditingLote(null);
    setLoteEventId('');
  }

  async function deleteEvent(id: string) {
    if (!confirm('Deletar evento?')) return;
    await fetch('/api/admin/events?id=' + id, { method: 'DELETE' });
    load();
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eventos e Lotes</h1>
          <p className="text-sm text-zinc-400">
            Crie eventos em página completa e gerencie lotes com virada de preço
          </p>
        </div>
        <Link href="/admin/eventos/novo" className="btn btn-primary whitespace-nowrap text-center">
          + Novo Evento
        </Link>
      </div>

      <div className="space-y-4">
        {events.length === 0 && (
          <div className="card p-8 text-center text-zinc-400 text-sm">
            Nenhum evento ainda.{' '}
            <Link href="/admin/eventos/novo" className="text-emerald-400 hover:underline">
              Criar o primeiro
            </Link>
          </div>
        )}

        {events.map((ev) => {
          const activeLote = ev.lotes?.find((l) => l.ativo) || ev.lotes?.[0];
          return (
            <div key={ev.id} className="card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-lg tracking-tight truncate">{ev.title}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{formatDate(ev.date)}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-zinc-950/50 p-1">
                    <Link
                      href={`/admin/eventos/${ev.id}/edit`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-zinc-200 hover:bg-white/10 transition"
                    >
                      <Edit size={13} className="opacity-70" />
                      Editar
                    </Link>
                    <span className="hidden sm:block w-px h-4 bg-white/10" aria-hidden />
                    <Link
                      href={`/admin/eventos/${ev.id}/ingresso/novo?tipo=lote`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white transition"
                    >
                      <ArrowRightLeft size={13} />
                      Virar lote
                    </Link>
                    <Link
                      href={`/admin/eventos/${ev.id}/ingresso/novo`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-white/10 transition"
                    >
                      <Ticket size={13} className="opacity-70" />
                      Novo ingresso
                    </Link>
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteEvent(ev.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border border-red-500/25 text-red-400/90 hover:bg-red-950/40 transition cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Deletar
                  </button>
                </div>
              </div>

              {ev.lotes && ev.lotes.length > 0 && (
                <div className="mt-5">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Link
                      href={`/admin/eventos/${ev.id}/ingresso/novo?tipo=lote`}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-400 transition"
                    >
                      <Plus size={13} />
                      Novo lote
                    </Link>
                    <Link
                      href={`/admin/eventos/${ev.id}/ingresso/novo`}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10 text-zinc-400 hover:text-white transition"
                    >
                      <Plus size={13} />
                      Novo ingresso
                    </Link>
                  </div>

                  <table className="w-full text-sm border border-white/10 rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-white/5 text-left text-xs text-zinc-400">
                        <th className="py-2.5 px-3 font-medium">
                          <Ticket size={14} className="inline mr-1 opacity-70" />
                          Lote
                        </th>
                        <th className="py-2.5 px-3 font-medium text-right">Preço</th>
                        <th className="py-2.5 px-3 font-medium text-right">Capacidade</th>
                        <th className="py-2.5 px-3 font-medium text-right">Vendidos</th>
                        <th className="py-2.5 px-3 font-medium text-right">Estoque</th>
                        <th className="py-2.5 px-3 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ev.lotes.map((l) => {
                        const vendidos = l.sold || 0;
                        const estoque = Math.max(0, l.totalQty - vendidos);
                        const esgotado = !l.ativo || estoque <= 0 || vendidos >= l.totalQty;
                        const isLow = !esgotado && estoque < 10;
                        return (
                          <tr
                            key={l.id}
                            className={`border-t border-white/5 hover:bg-white/5 ${esgotado && !l.ativo ? 'opacity-65' : ''}`}
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-medium flex flex-wrap items-center gap-2">
                                {l.nome}
                                {l.ativo && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-medium">
                                    Ativo
                                  </span>
                                )}
                                {esgotado && !l.ativo && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 font-medium">
                                    Esgotado
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-zinc-500">{formatDate(ev.date)}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {formatPrice(l.precoCents)}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">
                              {l.totalQty}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-zinc-400">
                              {vendidos}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span
                                className={`inline-flex items-center gap-1 tabular-nums font-medium ${esgotado ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400'}`}
                              >
                                {estoque}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/5 bg-zinc-950/40 p-0.5">
                                <button
                                  type="button"
                                  onClick={() => openEditLote(l, ev.id)}
                                  className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                                  title="Editar lote"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition cursor-pointer"
                                  title="Duplicar"
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (
                                      !confirm(
                                        'Remover este lote? Só é permitido se não houver pedidos/vendas.'
                                      )
                                    )
                                      return;
                                    try {
                                      const res = await fetch('/api/admin/lotes/delete', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: l.id, type: 'lote' }),
                                      });
                                      const data = await res.json();
                                      if (!res.ok) throw new Error(data.error || 'Falha');
                                      toast.success(data.message || 'Lote removido');
                                      load();
                                    } catch (e: unknown) {
                                      toast.error((e as Error).message || 'Erro ao remover');
                                    }
                                  }}
                                  className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition cursor-pointer"
                                  title="Deletar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-500">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/admin/pedidos?event=${ev.id}`}
                        className="inline-flex items-center gap-1 hover:text-zinc-200 transition"
                      >
                        <ExternalLink size={12} /> Pedidos
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span>
                        Capacidade:{' '}
                        <strong className="text-zinc-300 font-medium">
                          {ev.lotes.reduce((sum, l) => sum + l.totalQty, 0)}
                        </strong>
                      </span>
                      <span>
                        Vendidos:{' '}
                        <strong className="text-zinc-300 font-medium">
                          {ev.lotes.reduce((sum, l) => sum + (l.sold || 0), 0)}
                        </strong>
                      </span>
                      <span>
                        Estoque:{' '}
                        <strong className="text-emerald-400/90 font-medium">
                          {ev.lotes.reduce(
                            (sum, l) => sum + Math.max(0, l.totalQty - (l.sold || 0)),
                            0
                          )}
                        </strong>
                      </span>
                      <Link
                        href={`/admin/eventos/${ev.id}/edit`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition"
                      >
                        <Settings2 size={12} /> Configurar
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {(!ev.lotes || ev.lotes.length === 0) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/eventos/${ev.id}/ingresso/novo?tipo=lote`}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/30 transition"
                  >
                    <Plus size={13} /> Criar primeiro lote
                  </Link>
                  {activeLote ? null : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal só para ajuste rápido de preço/qtd de lote existente */}
      {showLoteModal && editingLote && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-4">Editar lote: {editingLote.nome}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400">Preço (R$)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={loteForm.preco}
                  onChange={(e) => setLoteForm({ ...loteForm, preco: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Quantidade Total</label>
                <input
                  className="input"
                  type="number"
                  value={loteForm.qty}
                  onChange={(e) => setLoteForm({ ...loteForm, qty: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={closeLoteModal} className="btn flex-1">
                Cancelar
              </button>
              <button type="button" onClick={submitLoteAction} className="btn btn-primary flex-1">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
