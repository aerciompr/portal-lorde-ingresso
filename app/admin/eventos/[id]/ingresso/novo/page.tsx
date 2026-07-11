'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { formatPrice, centsToInput, parseBRLToCents } from '@/lib/utils';

type Mode = 'ticket' | 'lote';

export default function NovoIngressoPage() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const eventId = params.id as string;
  const modeParam = search.get('tipo');
  const initialMode: Mode = modeParam === 'lote' ? 'lote' : 'ticket';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [activeLote, setActiveLote] = useState<{ nome: string; precoCents: number } | null>(null);
  const [loteAcrescimo, setLoteAcrescimo] = useState(500);
  const [defaultQty, setDefaultQty] = useState(50);

  const [form, setForm] = useState({
    nome: mode === 'lote' ? 'Lote Promocional' : 'Ingresso Padrão',
    preco: '35,00',
    qty: '50',
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/events');
        if (!res.ok) throw new Error();
        const events = await res.json();
        const found = events.find((e: { id: string }) => e.id === eventId);
        if (!found) {
          toast.error('Evento não encontrado');
          router.push('/admin/eventos');
          return;
        }
        setEventTitle(found.title);
        setActiveLote(found.activeLote || null);
        setLoteAcrescimo(found.loteAcrescimoCents ?? 500);
        setDefaultQty(found.loteDefaultQty ?? 50);

        const basePrice = found.activeLote?.precoCents ?? found.ticketTypes?.[0]?.priceCents ?? 3500;
        if (initialMode === 'lote') {
          setForm({
            nome: `Lote ${(found.lotes?.length || 0) + 1}`,
            preco: centsToInput(basePrice + (found.loteAcrescimoCents ?? 500)),
            qty: String(found.loteDefaultQty ?? 50),
          });
        } else {
          setForm({
            nome: 'Ingresso Padrão',
            preco: centsToInput(basePrice),
            qty: String(found.loteDefaultQty ?? 50),
          });
        }
      } catch {
        toast.error('Erro ao carregar evento');
        router.push('/admin/eventos');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId, router, initialMode]);

  function switchMode(m: Mode) {
    setMode(m);
    if (m === 'lote' && activeLote) {
      setForm((f) => ({
        ...f,
        nome: f.nome.startsWith('Ingresso') ? `Próximo lote` : f.nome,
        preco: centsToInput(activeLote.precoCents + loteAcrescimo),
        qty: String(defaultQty),
      }));
    }
  }

  async function handleSave() {
    const nome = form.nome.trim();
    if (!nome) {
      toast.error('Informe o nome');
      return;
    }
    const priceCents = parseBRLToCents(form.preco);
    const totalQty = parseInt(form.qty, 10) || 50;
    if (priceCents < 0 || totalQty < 1) {
      toast.error('Preço ou quantidade inválidos');
      return;
    }

    setSaving(true);
    try {
      if (mode === 'lote') {
        const res = await fetch('/api/admin/lotes/virar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId,
            newNome: nome,
            newPreco: priceCents,
            newQty: totalQty,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Falha ao criar lote');
        toast.success('Novo lote criado e ativado');
      } else {
        const res = await fetch('/api/admin/events', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: eventId,
            addTicketType: { name: nome, priceCents, totalQty },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Falha ao criar ingresso');
        toast.success('Tipo de ingresso criado');
      }
      router.push(`/admin/eventos/${eventId}/edit`);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-zinc-400">Carregando...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <Link
          href={`/admin/eventos/${eventId}/edit`}
          className="text-sm text-zinc-400 hover:text-white"
        >
          ← Voltar para edição do evento
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-3">
          {mode === 'lote' ? 'Novo lote' : 'Novo ingresso'}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Evento: <span className="text-zinc-200">{eventTitle}</span>
          {activeLote && (
            <>
              {' '}
              · Lote ativo: {activeLote.nome} ({formatPrice(activeLote.precoCents)})
            </>
          )}
        </p>
      </div>

      <div className="card p-6 space-y-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => switchMode('ticket')}
            className={`text-xs px-4 py-2 rounded-lg border transition ${
              mode === 'ticket'
                ? 'border-blue-500/60 bg-blue-500/15 text-blue-300'
                : 'border-white/10 text-zinc-400 hover:bg-white/5'
            }`}
          >
            Tipo de ingresso
          </button>
          <button
            type="button"
            onClick={() => switchMode('lote')}
            className={`text-xs px-4 py-2 rounded-lg border transition ${
              mode === 'lote'
                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                : 'border-white/10 text-zinc-400 hover:bg-white/5'
            }`}
          >
            Lote com virada (+{formatPrice(loteAcrescimo)})
          </button>
        </div>

        {mode === 'lote' && (
          <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Criar um lote <strong>ativa</strong> o novo e marca o anterior como esgotado (virada).
          </div>
        )}

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Nome</label>
          <input
            className="input"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder={mode === 'lote' ? '2º Lote' : 'Camarote / Pista'}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Preço (R$)</label>
            <input
              className="input"
              inputMode="decimal"
              value={form.preco}
              onChange={(e) => setForm({ ...form, preco: e.target.value })}
              placeholder="35,00"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Quantidade (capacidade)</label>
            <input
              className="input"
              type="number"
              min={1}
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
              placeholder="50"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <Link
            href={`/admin/eventos/${eventId}/edit`}
            className="btn btn-secondary flex-1 text-center py-2.5"
          >
            Cancelar
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary flex-1 py-2.5 disabled:opacity-60"
          >
            {saving ? 'Salvando...' : mode === 'lote' ? 'Criar e ativar lote' : 'Criar ingresso'}
          </button>
        </div>
      </div>
    </div>
  );
}
