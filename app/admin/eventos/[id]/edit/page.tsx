'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Plus, Ticket, Edit, Copy, Trash2 } from 'lucide-react';
import RichTextEditor from '@/components/RichTextEditor';
import { DEFAULT_EVENT_FOOTER_NOTICE, formatPrice, centsToInput, parseBRLToCents } from '@/lib/utils';

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
  footerNotice: string | null;
  hidden?: boolean;
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
    footerNotice: '',
    hidden: false,
    allowCancel: true,
    cancelHoursBefore: 24,
    cancelFeePercent: 10,
    loteAcrescimoCents: 500,
    loteDefaultQty: 50,
  });

  // Edit inline de lote existente (criar novo = página dedicada)
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
          footerNotice: found.footerNotice || '',
          hidden: found.hidden === true,
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

  async function handleImageUpload(file: File) {
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('purpose', 'event');
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        updateForm('imageUrl', data.url);
        const kb = data.bytes ? ` · ${Math.round(data.bytes / 1024)} KB` : '';
        toast.success(`Imagem otimizada e enviada${kb}`);
      } else {
        toast.error(data.error || 'Falha no upload');
      }
    } catch {
      toast.error('Erro no upload');
    } finally {
      setUploadingImage(false);
    }
  }

  async function updateLote(lote: any) {
    if (!lote?.id) return;
    const priceCents = parseBRLToCents(editLoteForm?.preco || '0');
    const totalQty = parseInt(editLoteForm?.qty || '0');
    const nome = String(editLoteForm?.nome || '').trim();
    try {
      const res = await fetch('/api/admin/lotes/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lote.id,
          nome: nome || undefined,
          precoCents: priceCents,
          totalQty,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar');
      toast.success('Lote atualizado');
      setEditingLote(null);
      setEditLoteForm(null);
      await refreshEventData();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao atualizar');
    }
  }

  async function deleteLoteOrTicket(id: string, isLote: boolean) {
    if (!confirm(isLote
      ? 'Remover este lote? Só é permitido se não houver pedidos/vendas vinculadas.'
      : 'Remover este tipo de ingresso? Só é permitido se não houver tickets emitidos.')) {
      return;
    }
    try {
      const res = await fetch('/api/admin/lotes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type: isLote ? 'lote' : 'ticketType' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao remover');
      toast.success(data.message || 'Removido');
      await refreshEventData();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Erro ao remover');
    }
  }

  function startEditLote(lote: any) {
    setEditingLote(lote);
    setEditLoteForm({
      nome: lote.nome || lote.name,
      preco: centsToInput(lote.precoCents || lote.priceCents || 0),
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
        footerNotice: form.footerNotice.trim() || null,
        hidden: form.hidden,
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
        {/* Grid: stacks full on mobile (grid-cols-1); Descrição (lg:col-span-3 ~75%) + Imagem (lg:col-span-1) on lg+ */}
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
          <div className="card p-6 lg:col-span-1 flex flex-col overflow-visible">
            <div className="label">Imagem do Evento</div>
            <div className="flex flex-col gap-2 mb-3 mt-2">
              <label className="btn btn-secondary text-xs cursor-pointer text-center px-3 py-1.5">
                {uploadingImage ? 'Enviando...' : 'Enviar'}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingImage} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
              </label>
              <input className="input text-sm" placeholder="URL da imagem" value={form.imageUrl} onChange={e => updateForm('imageUrl', e.target.value)} />
            </div>

            {form.imageUrl ? (
              <div className="relative w-full bg-zinc-900 rounded-2xl border border-white/10 min-h-[120px]">
                <img 
                  src={form.imageUrl} 
                  alt={`${form.title || 'Evento'} - preview (sem corte)`} 
                  className="w-full h-auto max-h-[360px] lg:max-h-[260px] object-contain bg-zinc-800" 
                />
                <button 
                  onClick={() => updateForm('imageUrl', '')} 
                  className="absolute top-2 right-2 z-10 bg-black/70 hover:bg-black/90 text-[10px] px-2 py-0.5 rounded"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="min-h-[120px] max-h-[360px] lg:max-h-[260px] w-full flex items-center justify-center border border-dashed border-white/20 rounded-2xl text-zinc-500 text-xs bg-zinc-950">
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
                  Ativo: {event.activeLote.nome} • {formatPrice(event.activeLote.precoCents)}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/eventos/${event.id}/ingresso/novo`}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
              >
                <Plus size={14} /> Novo ingresso
              </Link>
              <Link
                href={`/admin/eventos/${event.id}/ingresso/novo?tipo=lote`}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10"
              >
                <Plus size={14} /> Virar Lote (+{formatPrice(form.loteAcrescimoCents)})
              </Link>
            </div>
          </div>

          {/* Inline edit form */}
          {editingLote && editLoteForm && (
            <div className="mb-4 p-3 bg-zinc-950 border border-emerald-500/30 rounded-lg">
              <div className="text-xs text-emerald-400 mb-2">Editando lote</div>
              <div className="flex flex-wrap gap-2 text-xs items-center">
                <input
                  className="input py-1.5 text-sm min-w-[12rem] flex-1"
                  placeholder="Nome do lote"
                  value={editLoteForm.nome || ''}
                  onChange={(e) =>
                    setEditLoteForm({ ...editLoteForm, nome: e.target.value })
                  }
                />
                <input
                  className="input py-1.5 text-sm w-28"
                  placeholder="35,00"
                  inputMode="decimal"
                  value={editLoteForm.preco}
                  onChange={(e) =>
                    setEditLoteForm({ ...editLoteForm, preco: e.target.value })
                  }
                />
                <input
                  className="input py-1.5 text-sm w-24"
                  placeholder="Qtd"
                  type="number"
                  min={1}
                  value={editLoteForm.qty}
                  onChange={(e) =>
                    setEditLoteForm({ ...editLoteForm, qty: e.target.value })
                  }
                />
                <button
                  type="button"
                  onClick={() => updateLote(editingLote)}
                  className="btn btn-primary text-xs px-5"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingLote(null);
                    setEditLoteForm(null);
                  }}
                  className="btn btn-secondary text-xs px-4"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-left text-zinc-400 border-b border-white/10">
              <tr>
                <th className="p-3 font-medium"><Ticket size={14} className="inline mr-1" />Ingressos / Lotes</th>
                <th className="p-3 font-medium text-right">Preço</th>
                <th className="p-3 font-medium text-right">Capacidade</th>
                <th className="p-3 font-medium text-right">Vendidos</th>
                <th className="p-3 font-medium text-right">Estoque</th>
                <th className="p-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
                {event.ticketTypes && event.ticketTypes.length > 0 && event.ticketTypes.map((t: any) => {
                  const vendidos = t.sold || 0;
                  const estoque = Math.max(0, t.totalQty - vendidos);
                  const low = estoque < 5;
                  return (
                    <tr key={t.id} className="hover:bg-white/5">
                      <td className="p-3">
                        <div className="font-medium">{event.title} - {t.name}</div>
                        <div className="text-[10px] text-zinc-500">{new Date(event.date).toLocaleDateString('pt-BR')}</div>
                      </td>
                      <td className="p-3 text-right font-mono">{formatPrice(t.priceCents)}</td>
                      <td className="p-3 text-right tabular-nums">{t.totalQty}</td>
                      <td className="p-3 text-right tabular-nums text-zinc-400">{vendidos}</td>
                      <td className="p-3 text-right">
                        <span className={`tabular-nums font-medium ${low ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {estoque}
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
                  const vendidos = l.sold || 0;
                  const estoque = Math.max(0, l.totalQty - vendidos);
                  const esgotado = !l.ativo || vendidos >= l.totalQty;
                  const low = !esgotado && estoque < 5;
                  return (
                    <tr key={l.id} className={`hover:bg-white/5 ${esgotado && !l.ativo ? 'opacity-70' : ''}`}>
                      <td className="p-3">
                        <div className="font-medium">
                          {l.nome}
                          {l.ativo ? (
                            <span className="ml-2 text-[10px] text-emerald-400 font-normal">ATIVO</span>
                          ) : esgotado ? (
                            <span className="ml-2 text-[10px] text-red-400 font-normal">ESGOTADO</span>
                          ) : (
                            <span className="ml-2 text-[10px] text-zinc-500 font-normal">INATIVO</span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500">{new Date(event.date).toLocaleDateString('pt-BR')}</div>
                      </td>
                      <td className="p-3 text-right font-mono">{formatPrice(l.precoCents)}</td>
                      <td className="p-3 text-right tabular-nums">{l.totalQty}</td>
                      <td className="p-3 text-right tabular-nums text-zinc-400">{vendidos}</td>
                      <td className="p-3 text-right">
                        <span className={`tabular-nums font-medium ${esgotado ? 'text-red-400' : low ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {estoque}
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
                  <tr><td colSpan={6} className="p-3 text-xs text-zinc-500 text-center">Nenhum ingresso</td></tr>
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
            <div className="flex-1">
              <div className="text-xs text-zinc-500 mb-1">Endereço</div>
              <input className="input text-sm" value={form.address} onChange={e => updateForm('address', e.target.value)} />
            </div>
          </div>

          {/* Aviso legal (opcional) — aparece ao final da descrição no site */}
          <div className="mt-6 pt-5 border-t border-white/10">
            <div className="label mb-1">Aviso legal no final da descrição (opcional)</div>
            <textarea
              className="input text-sm min-h-[80px] w-full"
              placeholder={DEFAULT_EVENT_FOOTER_NOTICE}
              value={form.footerNotice}
              onChange={e => updateForm('footerNotice', e.target.value)}
            />
            <div className="text-[10px] text-zinc-500 mt-1.5">
              Se deixar em branco, o site exibe o texto padrão: &quot;{DEFAULT_EVENT_FOOTER_NOTICE}&quot;
            </div>
          </div>

          <label className="mt-5 flex items-start gap-3 cursor-pointer rounded-xl border border-amber-500/20 bg-amber-950/15 p-4">
            <input
              type="checkbox"
              className="mt-1 rounded border-white/20"
              checked={form.hidden}
              onChange={(e) => updateForm('hidden', e.target.checked)}
            />
            <span>
              <span className="text-sm font-medium text-amber-200">Evento oculto (exclusivo)</span>
              <span className="block text-[11px] text-zinc-500 mt-0.5">
                Não lista na home nem em Programação. Venda só pelo link direto (compartilhe com o
                público convidado). Check-in e admin continuam normais.
              </span>
              {event?.slug && form.hidden && (
                <button
                  type="button"
                  className="mt-2 text-xs text-emerald-400 hover:underline"
                  onClick={() => {
                    const url = `${window.location.origin}/evento/${event.slug}`;
                    void navigator.clipboard.writeText(url);
                    toast.success('Link copiado');
                  }}
                >
                  Copiar link: /evento/{event.slug}
                </button>
              )}
            </span>
          </label>

          <div className="mt-5 flex justify-end">
            <button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2 rounded-xl text-sm font-medium shadow-sm transition disabled:opacity-60">Salvar Alterações</button>
          </div>
        </div>
      </div>
    </div>
  );
}
