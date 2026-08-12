'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Award, Plus, Pencil, Power, Users } from 'lucide-react';
import { formatPrice, centsToInput, parseBRLToCents } from '@/lib/utils';

type LoyaltyPlan = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  freeEntriesPerCycle: number;
  checkinsPerEntry: number;
  overageDiscountPercent: number;
  stripePriceId: string | null;
  active: boolean;
  createdAt: string;
  _count?: { memberships: number };
};

type FormState = {
  name: string;
  description: string;
  priceInput: string;
  freeEntriesPerCycle: string;
  checkinsPerEntry: 1 | 2;
  overageDiscountPercent: string;
  stripePriceId: string;
  active: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  priceInput: centsToInput(3990),
  freeEntriesPerCycle: '1',
  checkinsPerEntry: 1,
  overageDiscountPercent: '10',
  stripePriceId: '',
  active: true,
});

export default function AdminFidelidadePage() {
  const [list, setList] = useState<LoyaltyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | '1' | '0'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

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
    setForm({
      name: p.name,
      description: p.description || '',
      priceInput: centsToInput(p.priceCents),
      freeEntriesPerCycle: String(p.freeEntriesPerCycle),
      checkinsPerEntry: p.checkinsPerEntry === 2 ? 2 : 1,
      overageDiscountPercent: String(p.overageDiscountPercent),
      stripePriceId: p.stripePriceId || '',
      active: p.active,
    });
    setShowForm(true);
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      priceCents: parseBRLToCents(form.priceInput),
      freeEntriesPerCycle: parseInt(form.freeEntriesPerCycle, 10) || 0,
      checkinsPerEntry: form.checkinsPerEntry,
      overageDiscountPercent: parseInt(form.overageDiscountPercent, 10) || 0,
      stripePriceId: form.stripePriceId.trim() || null,
      active: form.active,
    };
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('Informe o nome do pacote');
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
            Pacotes de assinatura mensal: entradas grátis por ciclo (1 ou 2 check-ins por
            entrada) + desconto para quem passar da cota. Cobrança recorrente ainda não está
            ligada — esta tela só gerencia os pacotes.
          </p>
        </div>
        <button type="button" className="btn btn-primary gap-2" onClick={startCreate}>
          <Plus className="w-4 h-4" />
          Novo pacote
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
              <label className="text-[11px] text-zinc-500 block mb-1">Mensalidade (R$) *</label>
              <input
                className="input text-sm"
                inputMode="decimal"
                value={form.priceInput}
                onChange={(e) => setForm({ ...form, priceInput: e.target.value })}
                placeholder="69,90"
              />
            </div>
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
              <select
                className="input text-sm"
                value={form.checkinsPerEntry}
                onChange={(e) =>
                  setForm({ ...form, checkinsPerEntry: (Number(e.target.value) === 2 ? 2 : 1) })
                }
              >
                <option value={1}>1 — só titular</option>
                <option value={2}>2 — titular + acompanhante</option>
              </select>
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

          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">
              Stripe Price ID (assinatura recorrente)
            </label>
            <input
              className="input text-sm font-mono"
              value={form.stripePriceId}
              onChange={(e) => setForm({ ...form, stripePriceId: e.target.value })}
              placeholder="price_... (criar no Dashboard Stripe — cobrança ainda não está ligada)"
            />
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
                <th className="px-3 py-2.5 text-right">Mensalidade</th>
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
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatPrice(p.priceCents)}
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
