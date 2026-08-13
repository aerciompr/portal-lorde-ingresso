'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Award, Plus, Pencil, Power, Users, Trash2, Undo2, TrendingUp, Gift, BarChart3 } from 'lucide-react';
import { formatPrice, centsToInput, parseBRLToCents } from '@/lib/utils';

type LoyaltyMetrics = {
  activeCount: number;
  pastDueCount: number;
  pendingCount: number;
  canceledLast30d: number;
  newLast30d: number;
  mrrCents: number;
  churnPercent: number;
};

const INTERVALS = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
type Interval = (typeof INTERVALS)[number];
const INTERVAL_LABELS: Record<Interval, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

type LoyaltyPlanPrice = {
  id: string;
  interval: string;
  priceCents: number;
  stripePriceId: string | null;
  active: boolean;
};

type LoyaltyPlan = {
  id: string;
  name: string;
  description: string | null;
  freeEntriesPerCycle: number;
  checkinsPerEntry: number;
  overageDiscountPercent: number;
  active: boolean;
  createdAt: string;
  prices: LoyaltyPlanPrice[];
  _count?: { memberships: number };
};

type PriceRow = {
  id?: string;
  interval: Interval;
  priceInput: string;
  stripePriceId: string;
  active: boolean;
};

type FormState = {
  name: string;
  description: string;
  freeEntriesPerCycle: string;
  checkinsPerEntry: string;
  overageDiscountPercent: string;
  active: boolean;
  prices: PriceRow[];
};

const emptyPriceRow = (interval: Interval = 'monthly'): PriceRow => ({
  interval,
  priceInput: centsToInput(3990),
  stripePriceId: '',
  active: true,
});

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  freeEntriesPerCycle: '1',
  checkinsPerEntry: '1',
  overageDiscountPercent: '10',
  active: true,
  prices: [emptyPriceRow()],
});

function priceSummary(prices: LoyaltyPlanPrice[]): string {
  const active = prices.filter((p) => p.active);
  if (!active.length) return '—';
  return active
    .map((p) => `${INTERVAL_LABELS[p.interval as Interval] || p.interval} ${formatPrice(p.priceCents)}`)
    .join(' · ');
}

export default function AdminFidelidadePage() {
  const [list, setList] = useState<LoyaltyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | '1' | '0'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [metrics, setMetrics] = useState<LoyaltyMetrics | null>(null);
  const [referralBonusInput, setReferralBonusInput] = useState('');
  const [savingReferral, setSavingReferral] = useState(false);

  useEffect(() => {
    fetch('/api/admin/loyalty-metrics', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setMetrics(data))
      .catch(() => setMetrics(null));
    fetch('/api/admin/loyalty-settings', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setReferralBonusInput(centsToInput(data.referralBonusCents));
      })
      .catch(() => {});
  }, []);

  async function saveReferralBonus() {
    setSavingReferral(true);
    try {
      const res = await fetch('/api/admin/loyalty-settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralBonusCents: parseBRLToCents(referralBonusInput) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      toast.success('Bônus de indicação atualizado');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingReferral(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilter !== 'all') params.set('active', activeFilter);
      const res = await fetch(`/api/admin/loyalty-plans?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar pacotes');
      setList(data.plans || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    load();
  }, [load]);

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

  function startEdit(p: LoyaltyPlan) {
    setEditingId(p.id);
    const activePrices = p.prices.filter((pp) => pp.active);
    setForm({
      name: p.name,
      description: p.description || '',
      freeEntriesPerCycle: String(p.freeEntriesPerCycle),
      checkinsPerEntry: String(p.checkinsPerEntry),
      overageDiscountPercent: String(p.overageDiscountPercent),
      active: p.active,
      prices: activePrices.length
        ? activePrices.map((pp) => ({
            id: pp.id,
            interval: (INTERVALS as readonly string[]).includes(pp.interval)
              ? (pp.interval as Interval)
              : 'monthly',
            priceInput: centsToInput(pp.priceCents),
            stripePriceId: pp.stripePriceId || '',
            active: true,
          }))
        : [emptyPriceRow()],
    });
    setShowForm(true);
  }

  function addPriceRow() {
    const used = new Set(form.prices.map((p) => p.interval));
    const next = INTERVALS.find((i) => !used.has(i)) || 'monthly';
    setForm({ ...form, prices: [...form.prices, emptyPriceRow(next)] });
  }

  function removePriceRow(index: number) {
    if (form.prices.length <= 1) {
      toast.error('O pacote precisa de ao menos uma periodicidade');
      return;
    }
    setForm({ ...form, prices: form.prices.filter((_, i) => i !== index) });
  }

  function updatePriceRow(index: number, patch: Partial<PriceRow>) {
    setForm({
      ...form,
      prices: form.prices.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      freeEntriesPerCycle: parseInt(form.freeEntriesPerCycle, 10) || 0,
      checkinsPerEntry: parseInt(form.checkinsPerEntry, 10) || 1,
      overageDiscountPercent: parseInt(form.overageDiscountPercent, 10) || 0,
      active: form.active,
      prices: form.prices.map((p) => ({
        id: p.id,
        interval: p.interval,
        priceCents: parseBRLToCents(p.priceInput),
        stripePriceId: p.stripePriceId.trim() || null,
        active: p.active,
      })),
    };
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('Informe o nome do pacote');
      return;
    }
    const intervals = form.prices.map((p) => p.interval);
    if (new Set(intervals).size !== intervals.length) {
      toast.error('Não repita a mesma periodicidade em duas linhas');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const url = editingId ? `/api/admin/loyalty-plans/${editingId}` : '/api/admin/loyalty-plans';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      toast.success(editingId ? 'Pacote atualizado' : 'Pacote criado');
      resetForm();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(p: LoyaltyPlan) {
    try {
      const res = await fetch(`/api/admin/loyalty-plans/${p.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !p.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha');
      toast.success(data.plan?.active ? 'Pacote ativado' : 'Pacote desativado');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-emerald-400" />
            Clube de fidelidade
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Pacotes de assinatura recorrente (mensal, trimestral, semestral ou anual — a cota
            de entradas grátis sempre reseta todo mês, mesmo em planos mais longos): entradas
            grátis por mês, quantos check-ins cada entrada libera (titular + acompanhantes) e
            desconto para quem passar da cota.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/fidelidade/membros" className="btn btn-secondary gap-2">
            <Users className="w-4 h-4" />
            Sócios
          </Link>
          <Link href="/admin/fidelidade/relatorios" className="btn btn-secondary gap-2">
            <BarChart3 className="w-4 h-4" />
            Relatórios
          </Link>
          <Link href="/admin/fidelidade/cancelamentos" className="btn btn-secondary gap-2">
            <Undo2 className="w-4 h-4" />
            Cancelamentos
          </Link>
          <button type="button" className="btn btn-primary gap-2" onClick={startCreate}>
            <Plus className="w-4 h-4" />
            Novo pacote
          </button>
        </div>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wide flex items-center gap-1">
              <Users className="w-3 h-3" /> Sócios ativos
            </div>
            <div className="text-2xl font-semibold mt-1 text-white">{metrics.activeCount}</div>
            {metrics.pastDueCount > 0 && (
              <div className="text-[11px] text-amber-400 mt-0.5">
                {metrics.pastDueCount} com pagamento pendente
              </div>
            )}
          </div>
          <div className="card p-4">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wide flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> MRR
            </div>
            <div className="text-2xl font-semibold mt-1 text-emerald-400">
              {formatPrice(metrics.mrrCents)}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">normalizado por mês</div>
          </div>
          <div className="card p-4">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wide">Churn (30d)</div>
            <div className="text-2xl font-semibold mt-1 text-white">{metrics.churnPercent}%</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {metrics.canceledLast30d} cancelamento(s)
            </div>
          </div>
          <div className="card p-4">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wide">Novos (30d)</div>
            <div className="text-2xl font-semibold mt-1 text-white">{metrics.newLast30d}</div>
          </div>
        </div>
      )}

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] text-zinc-500 flex items-center gap-1 mb-1">
            <Gift className="w-3.5 h-3.5" />
            Bônus de indicação (R$) — crédito na próxima fatura de quem indicou
          </label>
          <input
            className="input text-sm w-32"
            inputMode="decimal"
            value={referralBonusInput}
            onChange={(e) => setReferralBonusInput(e.target.value)}
            placeholder="20,00"
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={savingReferral}
          onClick={() => void saveReferralBonus()}
        >
          {savingReferral ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
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
            <h2 className="font-medium">{editingId ? 'Editar pacote' : 'Novo pacote'}</h2>
            <button type="button" className="text-xs text-zinc-500" onClick={resetForm}>
              Fechar
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Nome *</label>
              <input
                className="input text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Prata"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Descrição (opcional)</label>
              <input
                className="input text-sm"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Mostrado pro cliente na página do clube"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">
                Entradas grátis / mês *
              </label>
              <input
                className="input text-sm"
                type="number"
                min={0}
                value={form.freeEntriesPerCycle}
                onChange={(e) => setForm({ ...form, freeEntriesPerCycle: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">
                Check-ins por entrada *
              </label>
              <input
                className="input text-sm"
                type="number"
                min={1}
                value={form.checkinsPerEntry}
                onChange={(e) => setForm({ ...form, checkinsPerEntry: e.target.value })}
                placeholder="1 = só titular, 2+ = titular + acompanhantes"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                1 = só titular · 2 = titular + 1 acompanhante · etc.
              </p>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">
                Desconto no excedente (%) *
              </label>
              <input
                className="input text-sm"
                type="number"
                min={0}
                max={100}
                value={form.overageDiscountPercent}
                onChange={(e) => setForm({ ...form, overageDiscountPercent: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-zinc-500">Periodicidades de cobrança *</label>
              <button
                type="button"
                className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1"
                onClick={addPriceRow}
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar periodicidade
              </button>
            </div>
            {form.prices.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-1 sm:grid-cols-[8rem_6rem_1fr_auto] gap-2 items-center rounded-lg border border-white/10 bg-zinc-950/50 p-2"
              >
                <select
                  className="input py-1.5 text-sm"
                  value={row.interval}
                  onChange={(e) => updatePriceRow(i, { interval: e.target.value as Interval })}
                >
                  {INTERVALS.map((iv) => (
                    <option key={iv} value={iv}>
                      {INTERVAL_LABELS[iv]}
                    </option>
                  ))}
                </select>
                <input
                  className="input py-1.5 text-sm"
                  inputMode="decimal"
                  value={row.priceInput}
                  onChange={(e) => updatePriceRow(i, { priceInput: e.target.value })}
                  placeholder="69,90"
                />
                <input
                  className="input py-1.5 text-sm font-mono"
                  value={row.stripePriceId}
                  onChange={(e) => updatePriceRow(i, { stripePriceId: e.target.value })}
                  placeholder="price_... (Dashboard Stripe, mesmo intervalo)"
                />
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-white/10 text-zinc-500 hover:text-red-400 justify-self-end"
                  title="Remover periodicidade"
                  onClick={() => removePriceRow(i)}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Pacote ativo
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar pacote'}
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
          Nenhum pacote ainda. Clique em <strong>Novo pacote</strong> para criar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-zinc-400 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2.5">Pacote</th>
                <th className="px-3 py-2.5">Periodicidades</th>
                <th className="px-3 py-2.5 text-right">Entradas/mês</th>
                <th className="px-3 py-2.5 text-right">Check-ins</th>
                <th className="px-3 py-2.5 text-right">Desc. excedente</th>
                <th className="px-3 py-2.5 text-right">Assinantes</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-3">
                    <div className="font-medium">{p.name}</div>
                    {p.description && (
                      <div className="text-[11px] text-zinc-500 max-w-xs truncate">
                        {p.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-300 max-w-[14rem]">
                    {priceSummary(p.prices)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{p.freeEntriesPerCycle}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{p.checkinsPerEntry}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {p.overageDiscountPercent}%
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {p._count?.memberships ?? 0}
                    </span>
                  </td>
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
