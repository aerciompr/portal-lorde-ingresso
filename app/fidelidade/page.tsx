'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/utils';
import { formatCpf, formatPhone, cleanDigits, isValidCpf, isValidPhone } from '@/lib/masks';
import {
  Crown,
  Star,
  Award,
  Check,
  X,
  ShieldCheck,
  CreditCard,
  QrCode,
  DoorOpen,
  Users,
} from 'lucide-react';

type PlanPrice = { id: string; interval: string; priceCents: number };

type Plan = {
  id: string;
  name: string;
  description: string | null;
  freeEntriesPerCycle: number;
  checkinsPerEntry: number;
  overageDiscountPercent: number;
  prices: PlanPrice[];
};

const TIER_ICONS = [Star, Award, Crown];

const INTERVAL_ORDER = ['monthly', 'quarterly', 'semiannual', 'annual'];
const INTERVAL_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};
const INTERVAL_SUFFIX: Record<string, string> = {
  monthly: '/mês',
  quarterly: '/trimestre',
  semiannual: '/semestre',
  annual: '/ano',
};

function companionLabel(checkinsPerEntry: number): string {
  if (checkinsPerEntry <= 1) return 'Vale só para o titular';
  const extra = checkinsPerEntry - 1;
  return `Titular + até ${extra} acompanhante${extra === 1 ? '' : 's'}`;
}

/** Preço do plano na periodicidade escolhida; cai pro primeiro preço disponível se não tiver essa. */
function priceForInterval(plan: Plan, interval: string): PlanPrice | null {
  return plan.prices.find((p) => p.interval === interval) || plan.prices[0] || null;
}

export default function FidelidadePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [interval, setIntervalSel] = useState<string>('monthly');
  const [selected, setSelected] = useState<{ plan: Plan; price: PlanPrice } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', cpf: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/loyalty/plans')
      .then((r) => r.json())
      .then((data) => setPlans(data.plans || []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const availableIntervals = useMemo(() => {
    const set = new Set<string>();
    for (const p of plans) for (const pp of p.prices) set.add(pp.interval);
    return INTERVAL_ORDER.filter((i) => set.has(i));
  }, [plans]);

  // Se a periodicidade selecionada não existe em nenhum plano, cai pra primeira disponível
  useEffect(() => {
    if (availableIntervals.length && !availableIntervals.includes(interval)) {
      setIntervalSel(availableIntervals[0]);
    }
  }, [availableIntervals, interval]);

  function openSubscribe(plan: Plan) {
    const price = priceForInterval(plan, interval);
    if (!price) return;
    setSelected({ plan, price });
    setForm({ name: '', email: '', cpf: '', phone: '' });
  }

  async function submit() {
    if (!selected) return;
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const cpfDigits = cleanDigits(form.cpf);
    const phoneDigits = cleanDigits(form.phone);

    if (!name) {
      toast.error('Informe seu nome');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('E-mail inválido');
      return;
    }
    if (cpfDigits && !isValidCpf(cpfDigits)) {
      toast.error('CPF inválido');
      return;
    }
    if (phoneDigits && !isValidPhone(phoneDigits)) {
      toast.error('Telefone inválido');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/loyalty/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planPriceId: selected.price.id,
          name,
          email,
          cpf: cpfDigits || undefined,
          phone: phoneDigits || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao iniciar assinatura');
      window.location.href = data.url;
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível iniciar a assinatura');
      setSubmitting(false);
    }
  }

  const featuredIndex = plans.length >= 3 ? 1 : -1;

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden bg-zinc-950">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-950/30 via-zinc-950 to-zinc-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff10_0.5px,transparent_1px)] bg-[length:4px_4px] opacity-40" />
        <div className="relative max-w-4xl mx-auto px-6 pt-14 pb-16 sm:pt-20 sm:pb-20 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/15 ring-1 ring-amber-400/30 mb-5">
            <Crown className="w-7 h-7 text-amber-400" />
          </div>
          <div className="text-amber-400 text-sm tracking-[3px] mb-2 font-medium">
            CLUBE LORDE NELSON
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-2px] leading-tight mb-4 text-white">
            Vire sócio, entre de graça
          </h1>
          <p className="text-base sm:text-lg text-zinc-300 max-w-lg mx-auto leading-relaxed">
            Assine um pacote e ganhe entradas grátis todo mês — é só mostrar o cartão na
            porta. Depois da cota, ainda garante desconto nas próximas compras.
          </p>
        </div>
      </div>

      {/* Como funciona */}
      <div className="max-w-4xl mx-auto px-6 -mt-8 sm:-mt-10 relative z-10">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur p-4 sm:p-5">
          {[
            { icon: CreditCard, label: 'Assine o pacote' },
            { icon: QrCode, label: 'Receba seu cartão' },
            { icon: DoorOpen, label: 'Mostre na entrada' },
          ].map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center gap-1.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/10 text-amber-400">
                <step.icon className="w-4 h-4" />
              </span>
              <span className="text-[11px] sm:text-xs text-zinc-400 leading-tight">
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pacotes */}
      <div className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
        {!loading && availableIntervals.length > 1 && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-full border border-white/10 bg-zinc-900/80 p-1 gap-1">
              {availableIntervals.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIntervalSel(i)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                    interval === i
                      ? 'bg-amber-400 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {INTERVAL_LABELS[i] || i}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-zinc-900/50 p-6 h-72 animate-pulse"
              />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-2xl border border-white/10 bg-zinc-900/50">
            <Users className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-300 font-medium mb-2">Nenhum pacote disponível no momento</p>
            <p className="text-sm text-zinc-500 mb-6">
              Volte em breve — em pouco tempo o clube abre pra novos sócios.
            </p>
            <Link href="/" className="btn btn-secondary">
              Voltar para eventos
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            {plans.map((p, i) => {
              const Icon = TIER_ICONS[Math.min(i, TIER_ICONS.length - 1)];
              const featured = i === featuredIndex;
              const price = priceForInterval(p, interval);
              if (!price) return null;
              const fallback = price.interval !== interval;
              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-2xl p-6 transition-all ${
                    featured
                      ? 'border-2 border-amber-400/50 bg-gradient-to-b from-amber-950/30 to-zinc-900 shadow-lg shadow-amber-950/30 sm:-translate-y-2'
                      : 'border border-white/10 bg-zinc-900/50 hover:border-amber-400/30'
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full bg-amber-400 text-zinc-950">
                      Mais popular
                    </span>
                  )}

                  <span
                    className={`inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 ${
                      featured
                        ? 'bg-amber-400/15 text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </span>

                  <h2 className="text-lg font-semibold text-white">{p.name}</h2>
                  {p.description && (
                    <p className="text-xs text-zinc-500 mt-1">{p.description}</p>
                  )}

                  <div className="mt-4 flex items-baseline gap-1">
                    <span
                      className={`text-3xl font-bold ${featured ? 'text-amber-400' : 'text-emerald-400'}`}
                    >
                      {formatPrice(price.priceCents)}
                    </span>
                    <span className="text-zinc-500 text-sm">
                      {INTERVAL_SUFFIX[price.interval] || ''}
                    </span>
                  </div>
                  {fallback && (
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Disponível só no plano {INTERVAL_LABELS[price.interval] || price.interval}
                    </p>
                  )}

                  <ul className="mt-5 space-y-2.5 text-sm text-zinc-300 flex-1">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-white">{p.freeEntriesPerCycle}</strong> entrada
                        {p.freeEntriesPerCycle === 1 ? '' : 's'} grátis por mês
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{companionLabel(p.checkinsPerEntry)}</span>
                    </li>
                    {p.overageDiscountPercent > 0 ? (
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-white">{p.overageDiscountPercent}%</strong> de
                          desconto depois da cota do mês
                        </span>
                      </li>
                    ) : (
                      <li className="flex items-start gap-2 text-zinc-600">
                        <X className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Sem desconto extra depois da cota</span>
                      </li>
                    )}
                  </ul>

                  <button
                    type="button"
                    className={`w-full mt-6 ${featured ? 'btn' : 'btn btn-secondary'}`}
                    style={
                      featured
                        ? { background: '#d4af37', color: '#18181b', borderColor: '#d4af37' }
                        : undefined
                    }
                    onClick={() => openSubscribe(p)}
                  >
                    Quero esse
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-10 flex items-center justify-center gap-2 text-xs text-zinc-500">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Pagamento recorrente processado com segurança pela Stripe. Cancele quando quiser.
        </p>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-sm p-6 border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-lg">Assinar {selected.plan.name}</h3>
              <button
                type="button"
                className="text-zinc-500 hover:text-white"
                onClick={() => setSelected(null)}
                disabled={submitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              {formatPrice(selected.price.priceCents)}
              {INTERVAL_SUFFIX[selected.price.interval] || ''} ·{' '}
              {INTERVAL_LABELS[selected.price.interval] || selected.price.interval} · cancele
              quando quiser
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Nome *</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Seu nome completo"
                />
              </div>
              <div>
                <label className="label">E-mail *</label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="voce@email.com"
                />
              </div>
              <div>
                <label className="label">CPF (opcional)</label>
                <input
                  className="input"
                  value={formatCpf(form.cpf)}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <label className="label">Telefone (opcional)</label>
                <input
                  className="input"
                  value={formatPhone(form.phone)}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(82) 99999-9999"
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary w-full mt-5 disabled:opacity-60"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'Redirecionando…' : 'Continuar para pagamento'}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 mt-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              Checkout seguro da Stripe
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
