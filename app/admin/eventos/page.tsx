'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatPrice, formatDate, DEFAULT_EVENT_FOOTER_NOTICE, centsToInput, parseBRLToCents } from '@/lib/utils';
import { toast } from 'sonner';
import { Edit, Copy, Trash2, Plus, Ticket, ArrowRightLeft, Settings2, ExternalLink } from 'lucide-react';
import RichTextEditor from '@/components/RichTextEditor';

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
  lotes?: { id: string; nome: string; precoCents: number; totalQty: number; sold: number; viradaAutomatica: boolean; ativo: boolean }[];
  activeLote?: { id: string; nome: string; precoCents: number } | null;
}

export default function AdminEventos() {
  const [events, setEvents] = useState<Event[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [loteEventId, setLoteEventId] = useState('');
  const [editingLote, setEditingLote] = useState<any>(null);
  const [newEvent, setNewEvent] = useState({ title: '', date: '', price: '35,00', qty: '150', description: '', imageUrl: '', address: '', location: '', footerNotice: '', cancelHours: '24', cancelFee: '10' });
  const [loteForm, setLoteForm] = useState({ nome: '', preco: '30,00', qty: '50' });

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/events');
    if (res.ok) setEvents(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createOrUpdateEvent() {
    const payload: any = {
      ...(editingEvent && { id: editingEvent.id }),
      title: newEvent.title,
      date: newEvent.date,
      priceCents: parseBRLToCents(newEvent.price),
      qty: parseInt(newEvent.qty),
      description: newEvent.description,
      imageUrl: newEvent.imageUrl,
      address: newEvent.address,
      location: newEvent.location,
      footerNotice: newEvent.footerNotice?.trim() || null,
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
    setNewEvent({ title: '', date: '', price: '35,00', qty: '150', description: '', imageUrl: '', address: '', location: '', footerNotice: '', cancelHours: '24', cancelFee: '10' });
    setShowEventModal(true);
  }

  function openEditEvent(ev: any) {
    setEditingEvent(ev);
    setNewEvent({
      title: ev.title,
      date: new Date(ev.date).toISOString().slice(0, 16),
      price: centsToInput(ev.ticketTypes[0]?.priceCents || 3500),
      qty: (ev.ticketTypes[0]?.totalQty || 150).toString(),
      description: ev.description || '',
      imageUrl: ev.imageUrl || '',
      address: ev.address || '',
      location: ev.location || '',
      footerNotice: ev.footerNotice || '',
      cancelHours: (ev.cancelHoursBefore || 24).toString(),
      cancelFee: (ev.cancelFeePercent || 10).toString(),
    });
    setShowEventModal(true);
  }

  function closeEventModal() {
    setShowEventModal(false);
    setEditingEvent(null);
  }

  async function submitLoteAction() {
    if (!loteEventId) return;

    if (editingLote) {
      const res = await fetch('/api/admin/lotes/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingLote.id,
          precoCents: parseBRLToCents(loteForm.preco),
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
      const res = await fetch('/api/admin/lotes/virar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: loteEventId,
          newNome: loteForm.nome,
          newPreco: parseBRLToCents(loteForm.preco),
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
      preco: centsToInput(lote.precoCents),
      qty: lote.totalQty.toString(),
    });
    setShowLoteModal(true);
  }

  function virarLote(eventId: string) {
    setLoteEventId(eventId);
    setLoteForm({ nome: `Lote ${Date.now() % 100}`, preco: '30,00', qty: '50' });
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
          <p className="text-sm text-zinc-400">Crie eventos, configure lotes com virada automática de preço</p>
        </div>
        <button onClick={openCreateEvent} className="btn btn-primary whitespace-nowrap">+ Novo Evento</button>
      </div>

      <div className="space-y-4">
        {events.map(ev => {
          const activeLote = ev.lotes?.find((l: any) => l.ativo) || ev.lotes?.[0];
          return (
          <div key={ev.id} className="card p-5">
            {/* Header: título + ações agrupadas */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-lg tracking-tight truncate">{ev.title}</div>
                <div className="text-xs text-zinc-400 mt-0.5">{formatDate(ev.date)}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Grupo principal */}
                <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-zinc-950/50 p-1">
                  <a
                    href={`/admin/eventos/${ev.id}/edit`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-zinc-200 hover:bg-white/10 transition cursor-pointer"
                  >
                    <Edit size={13} className="opacity-70" />
                    Editar
                  </a>
                  <span className="hidden sm:block w-px h-4 bg-white/10" aria-hidden />
                  <button
                    type="button"
                    onClick={() => virarLote(ev.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white transition cursor-pointer"
                  >
                    <ArrowRightLeft size={13} />
                    Virar lote
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditLote(activeLote, ev.id)}
                    disabled={!activeLote}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-white/10 transition cursor-pointer disabled:opacity-40"
                  >
                    <Ticket size={13} className="opacity-70" />
                    Lote ativo
                  </button>
                </div>

                {/* Destrutivo separado */}
                <button
                  type="button"
                  onClick={() => deleteEvent(ev.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border border-red-500/25 text-red-400/90 hover:bg-red-950/40 hover:border-red-500/40 transition cursor-pointer"
                >
                  <Trash2 size={13} />
                  Deletar
                </button>
              </div>
            </div>

            {ev.lotes && ev.lotes.length > 0 && (
              <div className="mt-5">
                {/* Ações de lote — linha secundária, mais leve */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => virarLote(ev.id)}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-950/20 transition cursor-pointer"
                  >
                    <Plus size={13} />
                    Novo lote
                  </button>
                  <a
                    href={`/admin/eventos/${ev.id}/edit`}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
                  >
                    <Plus size={13} />
                    Novo ingresso
                  </a>
                </div>

                <table className="w-full text-sm border border-white/10 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-white/5 text-left text-xs text-zinc-400">
                      <th className="py-2.5 px-3 font-medium"><Ticket size={14} className="inline mr-1 opacity-70" />Lote</th>
                      <th className="py-2.5 px-3 font-medium text-right">Preço</th>
                      <th className="py-2.5 px-3 font-medium text-right">Capacidade</th>
                      <th className="py-2.5 px-3 font-medium text-right">Vendidos</th>
                      <th className="py-2.5 px-3 font-medium text-right">Estoque</th>
                      <th className="py-2.5 px-3 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ev.lotes.map((l: any) => {
                      const vendidos = l.sold || 0;
                      const estoque = Math.max(0, l.totalQty - vendidos);
                      const esgotado = !l.ativo || estoque <= 0 || vendidos >= l.totalQty;
                      const isLow = !esgotado && estoque < 10;
                      return (
                        <tr key={l.id} className={`border-t border-white/5 hover:bg-white/5 ${esgotado && !l.ativo ? 'opacity-65' : ''}`}>
                          <td className="py-2.5 px-3">
                            <div className="font-medium flex flex-wrap items-center gap-2">
                              {l.nome}
                              {l.ativo && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-medium">Ativo</span>
                              )}
                              {esgotado && !l.ativo && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 font-medium">Esgotado</span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500">{formatDate(ev.date)}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{formatPrice(l.precoCents)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">{l.totalQty}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-zinc-400">{vendidos}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`inline-flex items-center gap-1 tabular-nums font-medium ${esgotado ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
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
                                  if (!confirm('Remover este lote? Só é permitido se não houver pedidos/vendas.')) return;
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
                    <a href={`/admin/pedidos?event=${ev.id}`} className="inline-flex items-center gap-1 hover:text-zinc-200 transition">
                      <ExternalLink size={12} /> Pedidos
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      Capacidade:{' '}
                      <strong className="text-zinc-300 font-medium">
                        {ev.lotes.reduce((sum: number, l: any) => sum + l.totalQty, 0)}
                      </strong>
                    </span>
                    <span>
                      Vendidos:{' '}
                      <strong className="text-zinc-300 font-medium">
                        {ev.lotes.reduce((sum: number, l: any) => sum + (l.sold || 0), 0)}
                      </strong>
                    </span>
                    <span>
                      Estoque:{' '}
                      <strong className="text-emerald-400/90 font-medium">
                        {ev.lotes.reduce((sum: number, l: any) => sum + Math.max(0, l.totalQty - (l.sold || 0)), 0)}
                      </strong>
                    </span>
                    <a
                      href={`/admin/eventos/${ev.id}/edit`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition"
                    >
                      <Settings2 size={12} /> Configurar
                    </a>
                  </div>
                </div>
              </div>
            )}

            {(!ev.lotes || ev.lotes.length === 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => virarLote(ev.id)}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/30 transition cursor-pointer"
                >
                  <Plus size={13} /> Criar primeiro lote
                </button>
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Modals */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-xl p-6">
            <h3 className="font-semibold mb-4">Novo Evento</h3>
            <div className="space-y-3">
              <label className="block text-xs text-zinc-400">Título</label>
              <input className="input" placeholder="Ex: Copa do Mundo 2026" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} />
              <label className="block text-xs text-zinc-400">Data e Hora</label>
              <input className="input" type="datetime-local" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
              <label className="block text-xs text-zinc-400">Descrição</label>
              <RichTextEditor
                value={newEvent.description}
                onChange={(html) => setNewEvent({ ...newEvent, description: html })}
                placeholder="Escreva a descrição completa do evento..."
              />
              <div>
                <div className="text-[10px] text-zinc-500 mb-1">Prévia no card da home (resumo):</div>
                <div
                  className="text-sm text-zinc-500 line-clamp-2 p-2 bg-zinc-950 rounded border border-white/10 min-h-[2.2rem]"
                  dangerouslySetInnerHTML={{
                    __html: newEvent.description 
                      ? (() => {
                          const plain = newEvent.description.replace(/<[^>]+>/g, '').trim();
                          return plain.length > 120 ? plain.slice(0, 120) + '...' : newEvent.description;
                        })()
                      : ''
                  }}
                />
              </div>
              <label className="block text-xs text-zinc-400">URL da Imagem (Banner)</label>
              <input className="input" placeholder="https://exemplo.com/banner.jpg" value={newEvent.imageUrl} onChange={e => setNewEvent({...newEvent, imageUrl: e.target.value})} />
              <label className="block text-xs text-zinc-400">Endereço</label>
              <input className="input" placeholder="Rua Silvério Jorge, 241, Jaraguá, Maceió - AL" value={newEvent.address} onChange={e => setNewEvent({...newEvent, address: e.target.value})} />
              <label className="block text-xs text-zinc-400">Nome do Local / Pub (exibição no card)</label>
              <input className="input" placeholder="Lorde Nelson Rest Pub" value={newEvent.location} onChange={e => setNewEvent({...newEvent, location: e.target.value})} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400">Preço (R$)</label>
                  <input className="input" inputMode="decimal" placeholder="35,00" value={newEvent.price} onChange={e => setNewEvent({...newEvent, price: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400">Quantidade Total</label>
                  <input className="input" type="number" placeholder="150" value={newEvent.qty} onChange={e => setNewEvent({...newEvent, qty: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400">Horas antes para Cancelar</label>
                  <input className="input" type="number" placeholder="24" value={newEvent.cancelHours} onChange={e => setNewEvent({...newEvent, cancelHours: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400">Taxa de Cancelamento (%)</label>
                  <input className="input" type="number" step="0.1" placeholder="10" value={newEvent.cancelFee} onChange={e => setNewEvent({...newEvent, cancelFee: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Aviso legal no final da descrição (opcional)</label>
                <textarea
                  className="input text-sm min-h-[72px]"
                  placeholder={DEFAULT_EVENT_FOOTER_NOTICE}
                  value={newEvent.footerNotice}
                  onChange={e => setNewEvent({ ...newEvent, footerNotice: e.target.value })}
                />
                <div className="text-[10px] text-zinc-500 mt-1">
                  Em branco = texto padrão: &quot;{DEFAULT_EVENT_FOOTER_NOTICE}&quot;
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowEventModal(false); setEditingEvent(null); }} className="btn flex-1">Cancelar</button>
              <button onClick={createOrUpdateEvent} className="btn btn-primary flex-1">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {showLoteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-4">{editingLote ? 'Editar Lote' : 'Virar Lote (Novo)'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400">Nome do Lote</label>
                <input className="input" placeholder="Lote Promocional" value={loteForm.nome} onChange={e => setLoteForm({...loteForm, nome: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Preço (R$)</label>
                <input className="input" inputMode="decimal" placeholder="30,00" value={loteForm.preco} onChange={e => setLoteForm({...loteForm, preco: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">Quantidade Total</label>
                <input className="input" type="number" placeholder="50" value={loteForm.qty} onChange={e => setLoteForm({...loteForm, qty: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowLoteModal(false); setEditingLote(null); setLoteEventId(''); }} className="btn flex-1">Cancelar</button>
              <button onClick={submitLoteAction} className="btn btn-primary flex-1">{editingLote ? 'Salvar' : 'Criar / Virar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
