'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Plus, Ticket, Edit, Copy, Trash2 } from 'lucide-react';
import RichTextEditor from '@/components/RichTextEditor';

interface EventData {
  id: string;
  title: string;
  slug: string;
  date: string;
  openTime: string | null;
  description: string | null;
  imageUrl: string | null;
  address: string;
  location: string | null;
  salesDeadline: string | null;
  allowCancel: boolean;
  cancelHoursBefore: number;
  cancelFeePercent: number;
  loteAcrescimoCents: number;
  loteDefaultQty: number;
  ticketTypes: any[];
  lotes: any[];
  activeLote: any;
}

export default function EditEventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [event, setEvent] = useState<EventData | null>(null);

  const [form, setForm] = useState({
    title: '',
    date: '',
    openTime: '',
    description: '',
    imageUrl: '',
    address: '',
    location: '',
    salesDeadline: '',
    allowCancel: true,
    cancelHoursBefore: 24,
    cancelFeePercent: 10,
    loteAcrescimoCents: 500,
    loteDefaultQty: 50,
  });

  // Inline create/edit for ingressos/lotes (below image)
  const [showAddForm, setShowAddForm] = useState<'none' | 'ticket' | 'lote'>('none');
  const [addForm, setAddForm] = useState({ nome: 'Ingresso Padrão', preco: '35.00', qty: '50' });
  const [editingLote, setEditingLote] = useState<any>(null);
  const [editLoteForm, setEditLoteForm] = useState<any>(null);

  useEffect(() => {
    async function loadEvent() {
      try {
        const res = await fetch('/api/admin/events');
        if (!res.ok) throw new Error('Erro ao carregar');
        const events = await res.json();
        const found = events.find((e: any) => e.id === eventId);
        if (!found) {
          toast.error('Evento não encontrado');
          router.push('/admin/eventos');
          return;
        }

        setEvent(found);

        const dateStr = new Date(found.date).toISOString().slice(0, 16);
        const salesStr = found.salesDeadline ? new Date(found.salesDeadline).toISOString().slice(0, 16) : '';

        setForm({
          title: found.title || '',
          date: dateStr,
          openTime: found.openTime || '20:00',
          description: found.description || '',
          imageUrl: found.imageUrl || '',
          address: found.address || '',
          location: found.location || '',
          salesDeadline: salesStr,
          allowCancel: found.allowCancel ?? true,
          cancelHoursBefore: found.cancelHoursBefore ?? 24,
          cancelFeePercent: found.cancelFeePercent ?? 10,
          loteAcrescimoCents: found.loteAcrescimoCents ?? 500,
          loteDefaultQty: found.loteDefaultQty ?? 50,
        });
      } catch (e) {
        toast.error('Erro ao carregar evento');
        router.push('/admin/eventos');
      } finally {
        setLoading(false);
      }
    }
    loadEvent();
  }, [eventId, router]);

  const updateForm = (key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  async function refreshEventData() {
    try {
      const res = await fetch('/api/admin/events');
      if (!res.ok) return;
      const events = await res.json();
      const found = events.find((e: any) => e.id === eventId);
      if (found) {
        setEvent(found);
      }
    } catch {}
  }

  async function resizeImage(file: File, maxWidth = 1200, maxHeight = 800): Promise<File> {
    return new Promise<File>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
          if (ratio < 1) {
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) {
              const resized = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
              resolve(resized);
            } else {
              resolve(file);
            }
          }, 'image/jpeg', 0.92);
        };
        img.src = (e.target?.result as string) || '';
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleImageUpload(file: File) {
    if (!file) return;
    setUploadingImage(true);
    try {
      const resizedFile = await resizeImage(file);
      const fd = new FormData();
      fd.append('file', resizedFile);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        updateForm('imageUrl', data.url);
        toast.success('Imagem enviada e redimensionada');
      } else {
        toast.error(data.error || 'Falha no upload');
      }
    } catch {
      toast.error('Erro no upload');
    } finally {
      setUploadingImage(false);
    }
  }

  async function createIngressoOrLote(type: 'ticket' | 'lote') {
    if (!event) return;
    const nome = addForm.nome.trim() || (type === 'ticket' ? 'Ingresso Padrão' : 'Lote Promocional');
    const priceCents = Math.round(parseFloat(addForm.preco) * 100);
    const totalQty = parseInt(addForm.qty) || 50;

    try {
      if (type === 'lote') {
        // Use existing virar endpoint for new Lote (handles active switch)
        const res = await fetch('/api/admin/lotes/virar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: event.id,
            newNome: nome,
            newPreco: priceCents,
            newQty: totalQty,
          }),
        });
        if (!res.ok) throw new Error();
        toast.success('Novo lote criado');
      } else {
        // Create TicketType via extended events PUT
        const res = await fetch('/api/admin/events', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: event.id,
            addTicketType: { name: nome, priceCents, totalQty },
          }),
        });
        if (!res.ok) throw new Error();
        toast.success('Novo tipo de ingresso criado');
      }
      setShowAddForm('none');
      setAddForm({ nome: 'Ingresso Padrão', preco: '35.00', qty: '50' });
      await refreshEventData();
    } catch {
      toast.error('Erro ao criar ingresso/lote');
    }
  }

  async function updateLote(lote: any) {
    if (!lote?.id) return;
    const priceCents = Math.round(parseFloat(editLoteForm?.preco || '0') * 100);
    const totalQty = parseInt(editLoteForm?.qty || '0');
    try {
      const res = await fetch('/api/admin/lotes/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lote.id, precoCents: priceCents, totalQty }),
      });
      if (!res.ok) throw new Error();
      toast.success('Lote atualizado');
      setEditingLote(null);
      setEditLoteForm(null);
      await refreshEventData();
    } catch {
      toast.error('Erro ao atualizar');
    }
  }

  async function deleteLoteOrTicket(id: string, isLote: boolean) {
    if (!confirm('Remover este item? (pode afetar pedidos)')) return;
    // Note: no dedicated delete API; for now just hide warning - production would soft delete or archive
    toast.error('Remoção de lotes/ingressos requer endpoint dedicado (não implementado para segurança)');
  }

  function startEditLote(lote: any) {
    setEditingLote(lote);
    setEditLoteForm({
      nome: lote.nome || lote.name,
      preco: ((lote.precoCents || lote.priceCents || 0) / 100).toFixed(2),
      qty: (lote.totalQty || 0).toString(),
    });
  }

  async function handleSave() {
    if (!event) return;
    setSaving(true);
    try {
      const payload: any = {
        id: event.id,
        title: form.title,
        date: form.date,
        openTime: form.openTime,
        description: form.description,
        imageUrl: form.imageUrl,
        address: form.address,
        location: form.location,
        salesDeadline: form.salesDeadline || null,
        allowCancel: form.allowCancel,
        cancelHoursBefore: form.cancelHoursBefore,
        cancelFeePercent: form.cancelFeePercent,
        loteAcrescimoCents: form.loteAcrescimoCents,
        loteDefaultQty: form.loteDefaultQty,
      };
      const res = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success('Evento atualizado!');
      await refreshEventData();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8">Carregando...</div>;
  if (!event) return null;

  return (
    <div className="max-w-[1400px] mx-auto bg-zinc-950 text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-zinc-950 border-b border-white/10 px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/eventos" className="text-sm text-zinc-400 hover:text-white">← Voltar para Eventos</Link>
          <div className="h-5 w-px bg-white/10" />
          <input
            type="text"
            value={form.title}
            onChange={e => updateForm('title', e.target.value)}
            className="bg-transparent text-2xl font-semibold outline-none w-[500px] border-b border-transparent focus:border-emerald-500"
            placeholder="Título do evento"
          />
        </div>
        <div className="flex gap-3 items-center">
          <Link href={`/evento/${event.slug}`} target="_blank" className="text-sm px-4 py-1.5 rounded border border-white/20 hover:bg-white/5">Ver no site</Link>
          <button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2 rounded-xl text-sm font-medium shadow-sm transition disabled:opacity-60">
            {saving ? 'Salvando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="px-8 pt-6 pb-10 space-y-6">
        {/* Grid: Descrição (3 col / ~75%) + Imagem (1 col / ~25%) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Descrição */}
          <div className="card p-6 lg:col-span-3">
            <div className="label">Descrição</div>
            <div className="border border-white/10 rounded-xl overflow-hidden bg-zinc-900 mt-2">
              <RichTextEditor
                value={form.description}
                onChange={(html) => updateForm('description', html)}
                placeholder="Descrição completa com formatação rica..."
              />
            </div>
          </div>

          {/* Imagem */}
          <div className="card p-6 lg:col-span-1 flex flex-col">
            <div className="label">Imagem do Evento</div>
            <div className="flex flex-col gap-2 mb-3 mt-2">
              <label className="btn btn-secondary text-xs cursor-pointer text-center px-3 py-1.5">
                {uploadingImage ? 'Enviando...' : 'Enviar'}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingImage} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
              </label>
              <input className="input text-sm" placeholder="URL da imagem" value={form.imageUrl} onChange={e => updateForm('imageUrl', e.target.value)} />
            </div>

            {form.imageUrl ? (
              <div className="relative w-full flex-1 bg-zinc-900 rounded-2xl border border-white/10 min-h-[120px]">
                <img 
                  src={form.imageUrl} 
                  alt="Preview da imagem completa (sem corte)" 
                  className="w-full h-auto max-h-[320px] lg:max-h-[240px] object-contain bg-zinc-800" 
                />
                <button 
                  onClick={() => updateForm('imageUrl', '')} 
                  className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-[10px] px-2 py-0.5 rounded"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="h-48 lg:h-40 w-full flex items-center justify-center border border-dashed border-white/20 rounded-2xl text-zinc-500 text-xs bg-zinc-950 flex-1">
                Nenhuma imagem
              </div>
            )}
            <div className="text-[10px] text-zinc-500 mt-1.5">Completa (contain) no site.</div>
          </div>
        </div>

        {/* Card: Ingressos / Lotes com Virada (Fase 2) - padrão de Cards da tela de Pedidos */}
        <div className="card p-6 overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-zinc-400">Ingressos / Lotes</div>
              {event.activeLote && (
                <div className="text-xs text-emerald-400 mt-0.5">
                  Ativo: {event.activeLote.nome} • R$ {(event.activeLote.precoCents / 100).toFixed(2)}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => { setShowAddForm('ticket'); setAddForm({ nome: 'Ingresso Padrão', preco: '35.00', qty: String(event.loteDefaultQty || 50) }); }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
              >
                <Plus size={14} /> Novo ingresso
              </button>
              <button 
                onClick={() => { setShowAddForm('lote'); setAddForm({ nome: 'Lote Promocional', preco: String(((event.activeLote?.precoCents || 3000) + form.loteAcrescimoCents) / 100), qty: String(event.loteDefaultQty || 50) }); }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10"
              >
                <Plus size={14} /> Virar Lote (+{(form.loteAcrescimoCents / 100).toFixed(2)})
              </button>
            </div>
          </div>

          {/* Inline create form */}
          {showAddForm !== 'none' && (
            <div className="mb-4 p-3 bg-zinc-950 border border-white/10 rounded-lg">
              <div className="text-xs text-zinc-400 mb-2">{showAddForm === 'ticket' ? 'Criar novo tipo de ingresso' : 'Criar novo lote'}</div>
              <div className="grid grid-cols-1 gap-2 text-xs sm:flex sm:items-end sm:gap-3">
                <input 
                  className="input py-1.5 text-sm sm:w-64" 
                  placeholder="Nome do ingresso/lote" 
                  value={addForm.nome} 
                  onChange={e => setAddForm({ ...addForm, nome: e.target.value })} 
                />
                <div className="flex gap-2 sm:gap-3">
                  <input 
                    className="input py-1.5 text-sm w-28" 
                    placeholder="Preço" 
                    type="number" step="0.01" 
                    value={addForm.preco} 
                    onChange={e => setAddForm({ ...addForm, preco: e.target.value })} 
                  />
                  <input 
                    className="input py-1.5 text-sm w-24" 
                    placeholder="Qtd" 
                    type="number" 
                    value={addForm.qty} 
                    onChange={e => setAddForm({ ...addForm, qty: e.target.value })} 
                  />
                  <button onClick={() => createIngressoOrLote(showAddForm)} className="btn btn-primary text-xs px-5">Adicionar</button>
                  <button onClick={() => { setShowAddForm('none'); }} className="btn btn-secondary text-xs px-4">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {/* Inline edit form */}
          {editingLote && editLoteForm && (
            <div className="mb-4 p-3 bg-zinc-950 border border-emerald-500/30 rounded-lg">
              <div className="text-xs text-emerald-400 mb-2">Editando: {editingLote.nome || editingLote.name}</div>
              <div className="flex gap-2 text-xs">
                <input className="input py-1.5 text-sm w-28" placeholder="Preço" type="number" step="0.01" value={editLoteForm.preco} onChange={e=>setEditLoteForm({...editLoteForm, preco:e.target.value})} />
                <input className="input py-1.5 text-sm w-24" placeholder="Qtd" type="number" value={editLoteForm.qty} onChange={e=>setEditLoteForm({...editLoteForm, qty:e.target.value})} />
                <button onClick={() => updateLote(editingLote)} className="btn btn-primary text-xs px-5">Salvar</button>
                <button onClick={() => { setEditingLote(null); setEditLoteForm(null); }} className="btn btn-secondary text-xs px-4">Fechar</button>
              </div>
            </div>
          )}

          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-left text-zinc-400 border-b border-white/10">
              <tr>
                <th className="p-3 font-medium"><Ticket size={14} className="inline mr-1" />Ingressos</th>
                <th className="p-3 font-medium text-right">Preço</th>
                <th className="p-3 font-medium text-right">Capacidade</th>
                <th className="p-3 font-medium text-right">Disponível</th>
                <th className="p-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
                {event.ticketTypes && event.ticketTypes.length > 0 && event.ticketTypes.map((t: any) => {
                  const disp = t.totalQty - (t.sold || 0);
                  const low = disp < 5;
                  return (
                    <tr key={t.id} className="hover:bg-white/5">
                      <td className="p-3">
                        <div className="font-medium">{event.title} - {t.name}</div>
                        <div className="text-[10px] text-zinc-500">{new Date(event.date).toLocaleDateString('pt-BR')}</div>
                      </td>
                      <td className="p-3 text-right font-mono">R$ {(t.priceCents/100).toFixed(2)}</td>
                      <td className="p-3 text-right">{t.totalQty}</td>
                      <td className="p-3 text-right">
                        <span className={`inline-flex items-center gap-1 ${low ? 'text-red-400' : 'text-emerald-400'}`}>
                          {low && <span className="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[10px] mr-1">!</span>}
                          {disp}
                        </span>
                      </td>
                      <td className="p-3 text-right text-zinc-400">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => startEditLote(t)} className="p-0.5 hover:text-white" title="Editar"><Edit size={12} /></button>
                          <button className="p-0.5 hover:text-white" title="Duplicar"><Copy size={12} /></button>
                          <button onClick={() => deleteLoteOrTicket(t.id, false)} className="p-0.5 hover:text-red-400" title="Deletar"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {event.lotes && event.lotes.length > 0 && event.lotes.map((l: any) => {
                  const disp = l.totalQty - (l.sold || 0);
                  const low = disp < 5;
                  return (
                    <tr key={l.id} className="hover:bg-white/5">
                      <td className="p-3">
                        <div className="font-medium">{event.title} - {l.nome}</div>
                        <div className="text-[10px] text-zinc-500">{new Date(event.date).toLocaleDateString('pt-BR')}</div>
                      </td>
                      <td className="p-3 text-right font-mono">R$ {(l.precoCents/100).toFixed(2)}</td>
                      <td className="p-3 text-right">{l.totalQty}</td>
                      <td className="p-3 text-right">
                        <span className={`inline-flex items-center gap-1 ${low ? 'text-red-400' : 'text-emerald-400'}`}>
                          {low && <span className="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[10px] mr-1">!</span>}
                          {disp}
                        </span>
                      </td>
                      <td className="p-3 text-right text-zinc-400">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => startEditLote(l)} className="p-0.5 hover:text-white" title="Editar"><Edit size={12} /></button>
                          <button className="p-0.5 hover:text-white" title="Duplicar"><Copy size={12} /></button>
                          <button onClick={() => deleteLoteOrTicket(l.id, true)} className="p-0.5 hover:text-red-400" title="Deletar"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!event.ticketTypes || event.ticketTypes.length === 0) && (!event.lotes || event.lotes.length === 0) && (
                  <tr><td colSpan={5} className="p-3 text-xs text-zinc-500 text-center">Nenhum ingresso</td></tr>
                )}
              </tbody>
            </table>

            <div className="mt-4 flex justify-between text-xs text-zinc-400 px-1">
              <div>
                <a href={`/admin/pedidos?event=${event.id}`} className="hover:text-white">Ver participantes</a> | <a href={`/admin/pedidos?event=${event.id}`} className="hover:text-white">Ver pedidos</a>
              </div>
              <div className="flex items-center gap-2">
                Total Capacidade: {(event.lotes || []).reduce((s: number, l: any) => s + (l.totalQty || 0), 0) + (event.ticketTypes || []).reduce((s: number, t: any) => s + (t.totalQty || 0), 0)}
                <button onClick={() => router.push('/admin/eventos')} className="ml-1 text-xs px-2 py-0.5 border border-white/20 rounded hover:bg-white/5">Configurações</button>
              </div>
            </div>
          </div>

        {/* Settings (card or light bottom) */}
        <div className="card p-6">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Data e Hora</div>
              <input type="datetime-local" className="input text-sm" value={form.date} onChange={e => updateForm('date', e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Abertura</div>
              <input className="input text-sm" value={form.openTime} onChange={e => updateForm('openTime', e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Data limite vendas</div>
              <input type="datetime-local" className="input text-sm" value={form.salesDeadline} onChange={e => updateForm('salesDeadline', e.target.value)} />
            </div>
          </div>

          <div className="flex gap-4 items-end mt-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Local (nome no card)</div>
              <input className="input text-sm" value={form.location} onChange={e => updateForm('location', e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Endereço</div>
              <input className="input text-sm" value={form.address} onChange={e => updateForm('address', e.target.value)} />
            </div>
            <button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2 rounded-xl text-sm font-medium shadow-sm transition disabled:opacity-60">Salvar Alterações</button>
          </div>
        </div>
      </div>
    </div>
  );
}
