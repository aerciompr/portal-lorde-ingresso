'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import RichTextEditor from '@/components/RichTextEditor';
import { DEFAULT_EVENT_FOOTER_NOTICE, parseBRLToCents } from '@/lib/utils';

export default function NovoEventoPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [form, setForm] = useState({
    title: '',
    date: '',
    openTime: '20:00',
    description: '',
    imageUrl: '',
    address: 'Rua Silvério Jorge, 241, Jaraguá, Maceió - AL, 57022-110',
    location: 'Lorde Nelson Rest Pub',
    salesDeadline: '',
    footerNotice: '',
    allowCancel: true,
    cancelHoursBefore: 24,
    cancelFeePercent: 10,
    // primeiro lote / ingresso
    loteNome: '1º Lote',
    price: '35,00',
    qty: '150',
    loteAcrescimoCents: 500,
    loteDefaultQty: 50,
  });

  const updateForm = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

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
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(
                  new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
                );
              } else resolve(file);
            },
            'image/jpeg',
            0.92
          );
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
        toast.success('Imagem enviada');
      } else {
        toast.error(data.error || 'Falha no upload');
      }
    } catch {
      toast.error('Erro no upload');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleCreate() {
    if (!form.title.trim()) {
      toast.error('Informe o título do evento');
      return;
    }
    if (!form.date) {
      toast.error('Informe data e hora');
      return;
    }

    setSaving(true);
    try {
      const priceCents = parseBRLToCents(form.price);
      const qty = parseInt(form.qty, 10) || 150;

      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          date: form.date,
          openTime: form.openTime || null,
          description: form.description || null,
          imageUrl: form.imageUrl || null,
          address: form.address || undefined,
          location: form.location || null,
          salesDeadline: form.salesDeadline || null,
          footerNotice: form.footerNotice.trim() || null,
          allowCancel: form.allowCancel,
          cancelHoursBefore: form.cancelHoursBefore,
          cancelFeePercent: form.cancelFeePercent,
          priceCents,
          qty,
          loteNome: form.loteNome.trim() || '1º Lote',
          loteAcrescimoCents: form.loteAcrescimoCents,
          loteDefaultQty: form.loteDefaultQty,
        }),
      });

      const errBody = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        const detail =
          errBody.error ||
          (res.status === 401
            ? 'Sessão expirada — faça login de novo em /admin/login'
            : `Falha ao criar (HTTP ${res.status})`);
        throw new Error(detail);
      }

      if (!errBody.id) {
        throw new Error('Resposta inválida do servidor (sem id do evento)');
      }

      toast.success('Evento criado!');
      router.push(`/admin/eventos/${errBody.id}/edit`);
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Erro ao criar evento';
      console.error('[novo evento]', e);
      toast.error(msg, { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto bg-zinc-950 text-white">
      <div className="sticky top-0 z-50 bg-zinc-950 border-b border-white/10 px-4 sm:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/admin/eventos" className="text-sm text-zinc-400 hover:text-white shrink-0">
            ← Voltar para Eventos
          </Link>
          <div className="hidden sm:block h-5 w-px bg-white/10" />
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            className="bg-transparent text-xl sm:text-2xl font-semibold outline-none w-full max-w-[500px] border-b border-transparent focus:border-emerald-500"
            placeholder="Título do novo evento"
          />
        </div>
        <div className="flex gap-3 items-center shrink-0">
          <Link
            href="/admin/eventos"
            className="text-sm px-4 py-1.5 rounded border border-white/20 hover:bg-white/5"
          >
            Cancelar
          </Link>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 sm:px-8 py-2 rounded-xl text-sm font-medium shadow-sm transition disabled:opacity-60"
          >
            {saving ? 'Criando...' : 'Criar evento'}
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 pt-6 pb-10 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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

          <div className="card p-6 lg:col-span-1 flex flex-col">
            <div className="label">Imagem do Evento</div>
            <div className="flex flex-col gap-2 mb-3 mt-2">
              <label className="btn btn-secondary text-xs cursor-pointer text-center px-3 py-1.5">
                {uploadingImage ? 'Enviando...' : 'Enviar imagem'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f);
                    e.target.value = '';
                  }}
                />
              </label>
              <input
                className="input text-sm"
                placeholder="ou cole URL da imagem"
                value={form.imageUrl}
                onChange={(e) => updateForm('imageUrl', e.target.value)}
              />
            </div>
            {form.imageUrl ? (
              <div className="relative w-full bg-zinc-900 rounded-2xl border border-white/10">
                <img
                  src={form.imageUrl}
                  alt="Preview"
                  className="w-full h-auto max-h-[260px] object-contain bg-zinc-800"
                />
                <button
                  type="button"
                  onClick={() => updateForm('imageUrl', '')}
                  className="absolute top-2 right-2 z-10 bg-black/70 text-[10px] px-2 py-0.5 rounded"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="min-h-[120px] flex items-center justify-center border border-dashed border-white/20 rounded-2xl text-zinc-500 text-xs">
                Nenhuma imagem
              </div>
            )}
          </div>
        </div>

        {/* Primeiro ingresso / lote */}
        <div className="card p-6">
          <div className="text-xs uppercase tracking-widest text-zinc-400 mb-4">
            Primeiro ingresso / lote
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Nome do lote</div>
              <input
                className="input text-sm"
                value={form.loteNome}
                onChange={(e) => updateForm('loteNome', e.target.value)}
                placeholder="1º Lote"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Preço (R$)</div>
              <input
                className="input text-sm"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => updateForm('price', e.target.value)}
                placeholder="35,00"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Quantidade</div>
              <input
                className="input text-sm"
                type="number"
                value={form.qty}
                onChange={(e) => updateForm('qty', e.target.value)}
                placeholder="150"
              />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500 mt-3">
            Após criar, você poderá adicionar mais lotes e tipos de ingresso na página de edição.
          </p>
        </div>

        <div className="card p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Data e Hora</div>
              <input
                type="datetime-local"
                className="input text-sm"
                value={form.date}
                onChange={(e) => updateForm('date', e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Abertura (ex.: 20:00)</div>
              <input
                className="input text-sm"
                value={form.openTime}
                onChange={(e) => updateForm('openTime', e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Data limite vendas</div>
              <input
                type="datetime-local"
                className="input text-sm"
                value={form.salesDeadline}
                onChange={(e) => updateForm('salesDeadline', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Local (nome no card)</div>
              <input
                className="input text-sm"
                value={form.location}
                onChange={(e) => updateForm('location', e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Endereço</div>
              <input
                className="input text-sm"
                value={form.address}
                onChange={(e) => updateForm('address', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Horas antes para cancelar</div>
              <input
                className="input text-sm"
                type="number"
                value={form.cancelHoursBefore}
                onChange={(e) => updateForm('cancelHoursBefore', parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Taxa cancelamento (%)</div>
              <input
                className="input text-sm"
                type="number"
                step="0.1"
                value={form.cancelFeePercent}
                onChange={(e) => updateForm('cancelFeePercent', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-white/10">
            <div className="label mb-1">Aviso legal no final da descrição (opcional)</div>
            <textarea
              className="input text-sm min-h-[80px] w-full"
              placeholder={DEFAULT_EVENT_FOOTER_NOTICE}
              value={form.footerNotice}
              onChange={(e) => updateForm('footerNotice', e.target.value)}
            />
            <div className="text-[10px] text-zinc-500 mt-1.5">
              Em branco = texto padrão: &quot;{DEFAULT_EVENT_FOOTER_NOTICE}&quot;
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <Link href="/admin/eventos" className="btn btn-secondary px-6 py-2 text-sm">
              Cancelar
            </Link>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Criando...' : 'Criar evento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
