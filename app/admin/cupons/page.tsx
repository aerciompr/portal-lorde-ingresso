'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Tag, Plus, Pencil, Copy, Power } from 'lucide-react';
import { describePromoRules } from '@/lib/promo-validate';

type EventOpt = { id: string; title: string; slug: string };

type PromoCode = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  active: boolean;
  eventId: string | null;
  discountType: string;
  discountValue: number;
  minTickets: number | null;
  maxTicketsDiscounted: number | null;
  minSubtotalCents: number | null;
  maxUses: number | null;
  maxUsesPerEmail: number | null;
  reservedUses: number;
  redeemedUses: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  event?: EventOpt | null;
  redemptionsCount?: number;
};

type FormState = {
  code: string;
  name: string;
  description: string;
  active: boolean;
  eventId: string;
  discountType: 'PERCENT' | 'FIXED_ORDER' | 'FIXED_PER_TICKET';
  discountValue: string;
  minTickets: string;
  maxTicketsDiscounted: string;
  minSubtotalReais: string;
  useLimitMode: 'unlimited' | 'once' | 'n';
  maxUses: string;
  limitPerEmail: boolean;
  maxUsesPerEmail: string;
  startsAt: string;
  endsAt: string;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  description: '',
  active: true,
  eventId: '',
  discountType: 'PERCENT',
  discountValue: '10',
  minTickets: '',
  maxTicketsDiscounted: '',
  minSubtotalReais: '',
  useLimitMode: 'unlimited',
  maxUses: '',
  limitPerEmail: false,
  maxUsesPerEmail: '1',
  startsAt: '',
  endsAt: '',
});

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDiscount(p: PromoCode): string {
  if (p.discountType === 'PERCENT') return `${p.discountValue}%`;
  if (p.discountType === 'FIXED_ORDER')
    return `R$ ${(p.discountValue / 100).toFixed(2).replace('.', ',')}`;
  if (p.discountType === 'FIXED_PER_TICKET')
    return `R$ ${(p.discountValue / 100).toFixed(2).replace('.', ',')}/ing.`;
  return String(p.discountValue);
}

function usesLabel(p: PromoCode): string {
  const used = p.redeemedUses;
  const reserved = Math.max(0, p.reservedUses - p.redeemedUses);
  if (p.maxUses == null) {
    return `${used} pago(s)${reserved ? ` · ${reserved} reserva(s)` : ''}`;
  }
  return `${used}/${p.maxUses} pagos${reserved ? ` · ${reserved} reserva(s)` : ''}`;
}

export default function AdminCuponsPage() {
  const [list, setList] = useState<PromoCode[]>([]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | '1' | '0'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (activeFilter !== 'all') params.set('active', activeFilter);
      const res = await fetch(`/api/admin/promo-codes?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar cupons');
      setList(data.promoCodes || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [q, activeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/admin/events', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const raw = Array.isArray(data) ? data : data.events || [];
        const evs = (raw as { id: string; title: string; slug: string }[]).map(
          (e) => ({
            id: e.id,
            title: e.title,
            slug: e.slug,
          })
        );
        setEvents(evs);
      })
      .catch(() => setEvents([]));
  }, []);

  const preview = useMemo(() => {
    let discountValue = parseInt(form.discountValue, 10) || 0;
    if (form.discountType !== 'PERCENT') {
      // form em reais para FIXED_*
      discountValue = Math.round((parseFloat(form.discountValue.replace(',', '.')) || 0) * 100);
    }
    const maxUses =
      form.useLimitMode === 'unlimited'
        ? null
        : form.useLimitMode === 'once'
          ? 1
          : parseInt(form.maxUses, 10) || null;
    return describePromoRules({
      discountType: form.discountType,
      discountValue,
      maxTicketsDiscounted: form.maxTicketsDiscounted
        ? parseInt(form.maxTicketsDiscounted, 10)
        : null,
      maxUses,
      maxUsesPerEmail: form.limitPerEmail
        ? parseInt(form.maxUsesPerEmail, 10) || 1
        : null,
      eventTitle: form.eventId
        ? events.find((e) => e.id === form.eventId)?.title || 'evento'
        : null,
    });
  }, [form, events]);

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function startEdit(p: PromoCode) {
    setEditingId(p.id);
    const isPercent = p.discountType === 'PERCENT';
    setForm({
      code: p.code,
      name: p.name || '',
      description: p.description || '',
      active: p.active,
      eventId: p.eventId || '',
      discountType: (p.discountType as FormState['discountType']) || 'PERCENT',
      discountValue: isPercent
        ? String(p.discountValue)
        : (p.discountValue / 100).toFixed(2).replace('.', ','),
      minTickets: p.minTickets != null ? String(p.minTickets) : '',
      maxTicketsDiscounted:
        p.maxTicketsDiscounted != null ? String(p.maxTicketsDiscounted) : '',
      minSubtotalReais:
        p.minSubtotalCents != null
          ? (p.minSubtotalCents / 100).toFixed(2).replace('.', ',')
          : '',
      useLimitMode:
        p.maxUses == null ? 'unlimited' : p.maxUses === 1 ? 'once' : 'n',
      maxUses: p.maxUses != null && p.maxUses > 1 ? String(p.maxUses) : '',
      limitPerEmail: p.maxUsesPerEmail != null && p.maxUsesPerEmail > 0,
      maxUsesPerEmail:
        p.maxUsesPerEmail != null ? String(p.maxUsesPerEmail) : '1',
      startsAt: toDatetimeLocal(p.startsAt),
      endsAt: toDatetimeLocal(p.endsAt),
    });
    setShowForm(true);
  }

  function buildPayload() {
    const isPercent = form.discountType === 'PERCENT';
    let discountValue: number;
    if (isPercent) {
      discountValue = parseInt(form.discountValue, 10);
    } else {
      discountValue = Math.round(
        (parseFloat(String(form.discountValue).replace(',', '.')) || 0) * 100
      );
    }

    const maxUses =
      form.useLimitMode === 'unlimited'
        ? null
        : form.useLimitMode === 'once'
          ? 1
          : parseInt(form.maxUses, 10) || null;

    const minSubtotalReais = parseFloat(
      String(form.minSubtotalReais).replace(',', '.')
    );

    return {
      code: form.code,
      name: form.name || null,
      description: form.description || null,
      active: form.active,
      eventId: form.eventId || null,
      discountType: form.discountType,
      discountValue,
      minTickets: form.minTickets ? parseInt(form.minTickets, 10) : null,
      maxTicketsDiscounted: form.maxTicketsDiscounted
        ? parseInt(form.maxTicketsDiscounted, 10)
        : null,
      minSubtotalCents:
        form.minSubtotalReais && Number.isFinite(minSubtotalReais)
          ? Math.round(minSubtotalReais * 100)
          : null,
      maxUses,
      maxUsesPerEmail: form.limitPerEmail
        ? parseInt(form.maxUsesPerEmail, 10) || 1
        : null,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
    };
  }

  async function save() {
    if (!form.code.trim()) {
      toast.error('Informe o código do cupom');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const url = editingId
        ? `/api/admin/promo-codes/${editingId}`
        : '/api/admin/promo-codes';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      toast.success(editingId ? 'Cupom atualizado' : 'Cupom criado');
      resetForm();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(p: PromoCode) {
    try {
      const res = await fetch(`/api/admin/promo-codes/${p.id}/toggle`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha');
      toast.success(data.promoCode?.active ? 'Cupom ativado' : 'Cupom desativado');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Código copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Tag className="w-6 h-6 text-emerald-400" />
            Cupons promocionais
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Crie códigos com %, valor fixo ou por ingresso · uso único, limite de
            usos, por evento e por quantidade de ingressos.
          </p>
        </div>
        <button type="button" className="btn btn-primary gap-2" onClick={startCreate}>
          <Plus className="w-4 h-4" />
          Novo cupom
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="input max-w-xs text-sm"
          placeholder="Buscar código ou nome…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input w-auto text-sm"
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as 'all' | '1' | '0')}
        >
          <option value="all">Todos</option>
          <option value="1">Ativos</option>
          <option value="0">Inativos</option>
        </select>
        <button type="button" className="btn btn-secondary text-sm" onClick={() => load()}>
          Atualizar
        </button>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4 border border-emerald-500/20">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {editingId ? 'Editar cupom' : 'Novo cupom'}
            </h2>
            <button type="button" className="text-xs text-zinc-500" onClick={resetForm}>
              Fechar
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Código *</label>
              <input
                className="input text-sm uppercase"
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                placeholder="LORDE10"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Nome (admin)</label>
              <input
                className="input text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Campanha Instagram"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Nota interna</label>
            <input
              className="input text-sm"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Tipo de desconto *</label>
              <select
                className="input text-sm"
                value={form.discountType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discountType: e.target.value as FormState['discountType'],
                    discountValue:
                      e.target.value === 'PERCENT' ? '10' : '10,00',
                  })
                }
              >
                <option value="PERCENT">Percentual (%)</option>
                <option value="FIXED_ORDER">Valor fixo no pedido (R$)</option>
                <option value="FIXED_PER_TICKET">Valor por ingresso (R$)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">
                {form.discountType === 'PERCENT' ? 'Percentual' : 'Valor (R$)'} *
              </label>
              <input
                className="input text-sm"
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                placeholder={form.discountType === 'PERCENT' ? '10' : '20,00'}
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Evento</label>
              <select
                className="input text-sm"
                value={form.eventId}
                onChange={(e) => setForm({ ...form, eventId: e.target.value })}
              >
                <option value="">Todos os eventos</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">
                Mín. de ingressos
              </label>
              <input
                className="input text-sm"
                type="number"
                min={1}
                value={form.minTickets}
                onChange={(e) => setForm({ ...form, minTickets: e.target.value })}
                placeholder="ex: 2"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">
                Máx. ingressos com desconto
              </label>
              <input
                className="input text-sm"
                type="number"
                min={1}
                value={form.maxTicketsDiscounted}
                onChange={(e) =>
                  setForm({ ...form, maxTicketsDiscounted: e.target.value })
                }
                placeholder="vazio = todos"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">
                Valor mínimo do pedido (R$)
              </label>
              <input
                className="input text-sm"
                value={form.minSubtotalReais}
                onChange={(e) =>
                  setForm({ ...form, minSubtotalReais: e.target.value })
                }
                placeholder="ex: 50,00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] text-zinc-500">Limite de usos</div>
            <div className="flex flex-wrap gap-3 text-sm">
              {(
                [
                  ['unlimited', 'Ilimitado'],
                  ['once', 'Uso único'],
                  ['n', 'Até N usos'],
                ] as const
              ).map(([mode, label]) => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="useLimit"
                    checked={form.useLimitMode === mode}
                    onChange={() => setForm({ ...form, useLimitMode: mode })}
                  />
                  {label}
                </label>
              ))}
              {form.useLimitMode === 'n' && (
                <input
                  className="input w-24 text-sm"
                  type="number"
                  min={1}
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  placeholder="50"
                />
              )}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.limitPerEmail}
                onChange={(e) =>
                  setForm({ ...form, limitPerEmail: e.target.checked })
                }
              />
              Limitar por e-mail
              {form.limitPerEmail && (
                <input
                  className="input w-20 text-sm ml-2"
                  type="number"
                  min={1}
                  value={form.maxUsesPerEmail}
                  onChange={(e) =>
                    setForm({ ...form, maxUsesPerEmail: e.target.value })
                  }
                />
              )}
            </label>
            {form.limitPerEmail && (
              <p className="text-[11px] text-zinc-500">
                Validado no pagamento (quando o cliente informa o e-mail).
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Válido de</label>
              <input
                className="input text-sm"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Válido até</label>
              <input
                className="input text-sm"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Cupom ativo
          </label>

          <div className="rounded-xl bg-zinc-900/80 border border-white/10 px-3 py-2 text-xs text-zinc-300">
            <span className="text-zinc-500">Resumo: </span>
            {preview}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar cupom'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando…</p>
      ) : list.length === 0 ? (
        <div className="card p-8 text-center text-zinc-500 text-sm">
          Nenhum cupom ainda. Clique em <strong>Novo cupom</strong> para criar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-zinc-400 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2.5">Código</th>
                <th className="px-3 py-2.5">Desconto</th>
                <th className="px-3 py-2.5">Escopo</th>
                <th className="px-3 py-2.5">Usos</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-3">
                    <div className="font-mono font-medium text-emerald-400">{p.code}</div>
                    {p.name && (
                      <div className="text-[11px] text-zinc-500">{p.name}</div>
                    )}
                    {(p.minTickets || p.maxTicketsDiscounted) && (
                      <div className="text-[10px] text-zinc-600 mt-0.5">
                        {p.minTickets ? `mín ${p.minTickets} ing.` : ''}
                        {p.minTickets && p.maxTicketsDiscounted ? ' · ' : ''}
                        {p.maxTicketsDiscounted
                          ? `desc. em até ${p.maxTicketsDiscounted}`
                          : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{formatDiscount(p)}</td>
                  <td className="px-3 py-3 text-zinc-400 max-w-[10rem] truncate">
                    {p.event?.title || 'Todos'}
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-400">{usesLabel(p)}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        p.active
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-zinc-700/50 text-zinc-400'
                      }`}
                    >
                      {p.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-white/10 text-zinc-400"
                        title="Copiar"
                        onClick={() => void copyCode(p.code)}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-white/10 text-zinc-400"
                        title="Editar"
                        onClick={() => startEdit(p)}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-white/10 text-zinc-400"
                        title={p.active ? 'Desativar' : 'Ativar'}
                        onClick={() => void toggle(p)}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
