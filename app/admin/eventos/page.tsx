'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  formatPrice,
  formatDate,
  centsToInput,
  parseBRLToCents,
  isPastDeadline,
} from '@/lib/utils';
import { ymdInAppTz, startOfAppDay } from '@/lib/timezone';
import { toast } from 'sonner';
import {
  Edit,
  Copy,
  Trash2,
  Plus,
  Ticket,
  ArrowRightLeft,
  Settings2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Search,
  BarChart3,
  ScanLine,
} from 'lucide-react';

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
  salesDeadline?: string | null;
  hidden?: boolean;
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

type ScopeId = 'upcoming' | 'today' | 'past' | 'hidden' | 'all';

const SCOPE_STORAGE = 'admin.events.filter';

const SCOPES: { id: ScopeId; label: string }[] = [
  { id: 'upcoming', label: 'Próximos' },
  { id: 'today', label: 'Hoje' },
  { id: 'past', label: 'Passados' },
  { id: 'hidden', label: 'Ocultos' },
  { id: 'all', label: 'Todos' },
];

function eventIsPast(ev: Event): boolean {
  try {
    const startToday = startOfAppDay();
    return new Date(ev.date).getTime() < startToday.getTime();
  } catch {
    return false;
  }
}

function eventIsToday(ev: Event): boolean {
  return ymdInAppTz(ev.date) === ymdInAppTz(new Date());
}

function matchesScope(ev: Event, scope: ScopeId): boolean {
  if (scope === 'all') return true;
  if (scope === 'hidden') return Boolean(ev.hidden);
  if (scope === 'today') return eventIsToday(ev);
  if (scope === 'past') return eventIsPast(ev);
  return !eventIsPast(ev);
}

export default function AdminEventos() {
  const [events, setEvents] = useState<Event[]>([]);
  const [scope, setScope] = useState<ScopeId>('upcoming');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [loteEventId, setLoteEventId] = useState('');
  const [editingLote, setEditingLote] = useState<{
    id: string;
    nome: string;
    precoCents: number;
    totalQty: number;
  } | null>(null);
  const [loteForm, setLoteForm] = useState({ nome: '', preco: '30,00', qty: '50' });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCOPE_STORAGE) as ScopeId | null;
      if (saved && SCOPES.some((s) => s.id === saved)) setScope(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function changeScope(next: ScopeId) {
    setScope(next);
    try {
      localStorage.setItem(SCOPE_STORAGE, next);
    } catch {
      /* ignore */
    }
  }

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/events');
    if (res.ok) setEvents(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return events
      .filter((ev) => matchesScope(ev, scope))
      .filter((ev) => {
        if (!term) return true;
        return (
          ev.title.toLowerCase().includes(term) ||
          (ev.slug || '').toLowerCase().includes(term)
        );
      });
  }, [events, scope, q]);

  const counts = useMemo(() => {
    const c: Record<ScopeId, number> = {
      upcoming: 0,
      today: 0,
      past: 0,
      hidden: 0,
      all: events.length,
    };
    for (const ev of events) {
      if (!eventIsPast(ev)) c.upcoming += 1;
      if (eventIsToday(ev)) c.today += 1;
      if (eventIsPast(ev)) c.past += 1;
      if (ev.hidden) c.hidden += 1;
    }
    return c;
  }, [events]);

  async function submitLoteAction() {
    if (!loteEventId || !editingLote) return;

    const res = await fetch('/api/admin/lotes/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingLote.id,
        nome: loteForm.nome.trim(),
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

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eventos e Lotes</h1>
          <p className="text-sm text-zinc-400">
            Lista compacta · lotes sob demanda · padrão: próximos (passados escondidos)
          </p>
        </div>
        <Link href="/admin/eventos/novo" className="btn btn-primary whitespace-nowrap text-center">
          + Novo Evento
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => changeScope(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                scope === s.id
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'border-white/10 text-zinc-400 hover:bg-white/5'
              }`}
            >
              {s.label}
              <span className="ml-1 opacity-70 tabular-nums">{counts[s.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto w-full sm:w-64">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
          <input
            type="search"
            className="input pl-9 text-sm py-2"
            placeholder="Buscar título ou slug…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {events.length === 0 && (
          <div className="card p-8 text-center text-zinc-400 text-sm">
            Nenhum evento ainda.{' '}
            <Link href="/admin/eventos/novo" className="text-emerald-400 hover:underline">
              Criar o primeiro
            </Link>
          </div>
        )}

        {events.length > 0 && filtered.length === 0 && (
          <div className="card p-8 text-center text-zinc-400 text-sm">
            Nenhum evento neste filtro.
            {scope !== 'all' && (
              <>
                {' '}
                <button
                  type="button"
                  className="text-emerald-400 hover:underline"
                  onClick={() => changeScope('all')}
                >
                  Ver todos
                </button>
              </>
            )}
          </div>
        )}

        {filtered.map((ev) => {
          const activeLote =
            ev.lotes?.find((l) => l.ativo) ||
            (ev.activeLote
              ? ev.lotes?.find((l) => l.id === ev.activeLote?.id)
              : undefined) ||
            ev.lotes?.[0];
          const cap = (ev.lotes || []).reduce((s, l) => s + l.totalQty, 0);
          const sold = (ev.lotes || []).reduce((s, l) => s + (l.sold || 0), 0);
          const stock = (ev.lotes || []).reduce(
            (s, l) => s + Math.max(0, l.totalQty - (l.sold || 0)),
            0
          );
          const activeStock = activeLote
            ? Math.max(0, activeLote.totalQty - (activeLote.sold || 0))
            : null;
          const pastDay = eventIsPast(ev);
          const today = eventIsToday(ev);
          const salesClosed = isPastDeadline({
            salesDeadline: ev.salesDeadline,
            date: ev.date,
          });
          const isOpen = Boolean(expanded[ev.id]);

          return (
            <div key={ev.id} className="card p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-base sm:text-lg tracking-tight truncate">
                      {ev.title}
                    </div>
                    {today && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                        Hoje
                      </span>
                    )}
                    {pastDay && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/10">
                        Passado
                      </span>
                    )}
                    {ev.hidden && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-500/30">
                        Oculto
                      </span>
                    )}
                    {salesClosed && !pastDay && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-950/50 text-red-300 border border-red-500/25">
                        Vendas encerradas
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">{formatDate(ev.date)}</div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                    {activeLote ? (
                      <span>
                        <span className="text-zinc-500">Lote ativo:</span>{' '}
                        <strong className="text-zinc-200 font-medium">{activeLote.nome}</strong>
                        {' · '}
                        {formatPrice(activeLote.precoCents)}
                        {activeStock != null && (
                          <>
                            {' · '}
                            <span
                              className={
                                activeStock <= 0
                                  ? 'text-red-400'
                                  : activeStock < 10
                                    ? 'text-amber-400'
                                    : 'text-emerald-400'
                              }
                            >
                              {activeStock} rest.
                            </span>
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-500">Sem lote</span>
                    )}
                    {(ev.lotes?.length || 0) > 0 && (
                      <span className="tabular-nums text-zinc-500">
                        {sold}/{cap || 0} vend. · estoque {stock}
                      </span>
                    )}
                  </div>

                  {ev.hidden && (
                    <button
                      type="button"
                      className="text-[11px] text-emerald-400 hover:underline mt-1"
                      onClick={() => {
                        const url = `${window.location.origin}/evento/${ev.slug}`;
                        void navigator.clipboard.writeText(url);
                        toast.success('Link exclusivo copiado');
                      }}
                    >
                      Copiar link de venda
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto lg:shrink-0">
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-zinc-950/50 p-1 w-full sm:w-auto">
                    <Link
                      href={`/admin/eventos/${ev.id}/edit`}
                      className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg text-zinc-200 hover:bg-white/10 transition"
                    >
                      <Edit size={13} className="opacity-70 shrink-0" />
                      Editar
                    </Link>
                    <Link
                      href={`/admin/eventos/${ev.id}/ingresso/novo?tipo=lote`}
                      className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white transition"
                    >
                      <ArrowRightLeft size={13} className="shrink-0" />
                      Virar
                    </Link>
                    <Link
                      href={`/admin/pedidos?event=${ev.id}`}
                      className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-white/10 transition"
                    >
                      <ExternalLink size={13} className="opacity-70 shrink-0" />
                      Pedidos
                    </Link>
                    <Link
                      href={`/admin/reports?eventId=${ev.id}`}
                      className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-white/10 transition"
                      title="Relatório deste evento"
                    >
                      <BarChart3 size={13} className="opacity-70 shrink-0" />
                      <span className="hidden xs:inline sm:inline">Relatório</span>
                      <span className="sm:hidden">Rel.</span>
                    </Link>
                    <Link
                      href={`/checkin/evento/${ev.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-white/10 transition"
                      title="Check-in do evento"
                    >
                      <ScanLine size={13} className="opacity-70 shrink-0" />
                      Check-in
                    </Link>
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteEvent(ev.id)}
                    className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2.5 py-1.5 rounded-xl border border-red-500/25 text-red-400/90 hover:bg-red-950/40 transition cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Deletar
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => toggleExpand(ev.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition cursor-pointer"
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Lotes e detalhes
                  {(ev.lotes?.length || 0) > 0 && (
                    <span className="text-zinc-600">({ev.lotes!.length})</span>
                  )}
                </button>

                {isOpen && (
                  <div className="mt-3">
                    {ev.lotes && ev.lotes.length > 0 ? (
                      <>
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

                        <div className="table-scroll overflow-x-auto -mx-1 px-1">
                        <table className="w-full text-sm border border-white/10 rounded-xl overflow-hidden min-w-[520px]">
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
                              const esgotado =
                                !l.ativo || estoque <= 0 || vendidos >= l.totalQty;
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
                                            toast.error(
                                              (e as Error).message || 'Erro ao remover'
                                            );
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
                        </div>

                        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-500">
                          <div className="flex flex-wrap items-center gap-3">
                            <span>
                              Capacidade:{' '}
                              <strong className="text-zinc-300 font-medium">{cap}</strong>
                            </span>
                            <span>
                              Vendidos:{' '}
                              <strong className="text-zinc-300 font-medium">{sold}</strong>
                            </span>
                            <span>
                              Estoque:{' '}
                              <strong className="text-emerald-400/90 font-medium">{stock}</strong>
                            </span>
                          </div>
                          <Link
                            href={`/admin/eventos/${ev.id}/edit`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition"
                          >
                            <Settings2 size={12} /> Configurar
                          </Link>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/eventos/${ev.id}/ingresso/novo?tipo=lote`}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/30 transition"
                        >
                          <Plus size={13} /> Criar primeiro lote
                        </Link>
                        <Link
                          href={`/admin/eventos/${ev.id}/ingresso/novo`}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10 text-zinc-400 hover:text-white transition"
                        >
                          <Plus size={13} /> Novo ingresso
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showLoteModal && editingLote && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-4">Editar lote</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400">Nome do lote</label>
                <input
                  className="input"
                  value={loteForm.nome}
                  onChange={(e) => setLoteForm({ ...loteForm, nome: e.target.value })}
                  placeholder="Lote 2"
                />
              </div>
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
                  min={1}
                  value={loteForm.qty}
                  onChange={(e) => setLoteForm({ ...loteForm, qty: e.target.value })}
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Não pode ser menor que o já vendido neste lote.
                </p>
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
