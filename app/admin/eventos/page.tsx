'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatPrice, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { Edit, Copy, Trash2, Users, ShoppingCart, Plus, Ticket } from 'lucide-react';
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
  const [newEvent, setNewEvent] = useState({ title: '', date: '', price: '35.00', qty: '150', description: '', imageUrl: '', address: '', location: '', cancelHours: '24', cancelFee: '10' });
  const [loteForm, setLoteForm] = useState({ nome: '', preco: '30.00', qty: '50' });

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
      priceCents: Math.round(parseFloat(newEvent.price) * 100),
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
      price: ((ev.ticketTypes[0]?.priceCents || 3500) / 100).toFixed(2),
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

  async function submitLoteAction() {
    if (!loteEventId) return;

    if (editingLote) {
      const res = await fetch('/api/admin/lotes/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingLote.id,
          precoCents: Math.round(parseFloat(loteForm.preco) * 100),
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
          newPreco: Math.round(parseFloat(loteForm.preco) * 100),
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
      preco: (lote.precoCents / 100).toFixed(2),
      qty: lote.totalQty.toString(),
    });
    setShowLoteModal(true);
  }

  function virarLote(eventId: string) {
    setLoteEventId(eventId);
    setLoteForm({ nome: `Lote ${Date.now() % 100}`, preco: '3000', qty: '50' });
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
        {events.map(ev => (
          <div key={ev.id} className="card p-5">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-semibold">{ev.title}</div>
                <div className="text-xs text-zinc-400">{formatDate(ev.date)}</div>
              </div>
              <div className="flex gap-2">
                <a href={`/admin/eventos/${ev.id}/edit`} className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20 cursor-pointer">Editar</a>
                <button onClick={() => virarLote(ev.id)} className="text-xs px-3 py-1 rounded bg-blue-600/80 hover:bg-blue-600 cursor-pointer">Virar Lote</button>
                <button onClick={() => openEditLote(ev.lotes?.find((l: any) => l.ativo) || ev.lotes?.[0], ev.id)} className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20 cursor-pointer">Editar Lote Ativo</button>
                <button onClick={() => deleteEvent(ev.id)} className="text-xs px-3 py-1 rounded bg-red-600/70 hover:bg-red-600 cursor-pointer">Deletar</button>
              </div>
            </div>

            {ev.lotes && ev.lotes.length > 0 && (
              <div className="mt-4">
                <div className="flex gap-2 mb-2">
                  <button onClick={() => virarLote(ev.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                    <Plus size={14} /> Novo ingresso
                  </button>
                  <button onClick={() => virarLote(ev.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                    <Plus size={14} /> Novo Lote Promocional
                  </button>
                </div>
                <table className="w-full text-sm border border-white/10 rounded overflow-hidden">
                  <thead>
                    <tr className="bg-white/5 text-left text-xs text-zinc-400">
                      <th className="py-2 px-3 font-medium"><Ticket size={14} className="inline mr-1" />Ingressos</th>
                      <th className="py-2 px-3 font-medium text-right">Preço</th>
                      <th className="py-2 px-3 font-medium text-right">Capacidade</th>
                      <th className="py-2 px-3 font-medium text-right">Disponível</th>
                      <th className="py-2 px-3 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ev.lotes.map((l: any) => {
                      const disponivel = l.totalQty - l.sold;
                      const isLow = disponivel < 10;
                      return (
                        <tr key={l.id} className="border-t border-white/5 hover:bg-white/5">
                          <td className="py-2 px-3">
                            <div className="font-medium">{ev.title} - {l.nome}</div>
                            <div className="text-xs text-zinc-500">{formatDate(ev.date)}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">R$ {(l.precoCents / 100).toFixed(2)}</td>
                          <td className="py-2 px-3 text-right">{l.totalQty}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={`inline-flex items-center gap-1 ${isLow ? 'text-red-400' : 'text-emerald-400'}`}>
                              {isLow && <span className="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[10px] mr-1">!</span>} {disponivel}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex gap-1 justify-end text-zinc-400">
                              <button onClick={() => openEditLote(l, ev.id)} className="p-1 hover:text-white" title="Editar"><Edit size={14} /></button>
                              <button className="p-1 hover:text-white" title="Duplicar"><Copy size={14} /></button>
                              <button onClick={() => { if (confirm('Deletar lote?')) { /* implement delete if API exists */ } }} className="p-1 hover:text-red-400" title="Deletar"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-2 flex justify-between text-xs text-zinc-400">
                  <div>
                    <a href={`/admin/pedidos?event=${ev.id}`} className="hover:text-white">Ver participantes</a> | <a href={`/admin/pedidos?event=${ev.id}`} className="hover:text-white">Ver pedidos</a>
                  </div>
                  <div className="flex items-center gap-2">
                    Total Capacidade Evento: {ev.lotes.reduce((sum: number, l: any) => sum + l.totalQty, 0)}
                    <button className="ml-2 text-xs px-2 py-0.5 border border-white/20 rounded hover:bg-white/5">Configurações</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
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
                  <input className="input" type="number" step="0.01" placeholder="35.00" value={newEvent.price} onChange={e => setNewEvent({...newEvent, price: e.target.value})} />
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
                <input className="input" type="number" step="0.01" placeholder="30.00" value={loteForm.preco} onChange={e => setLoteForm({...loteForm, preco: e.target.value})} />
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
