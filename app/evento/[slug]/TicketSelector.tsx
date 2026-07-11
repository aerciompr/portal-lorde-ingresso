'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/utils';
import { toast } from 'sonner';

interface TicketType {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  totalQty: number;
  sold: number;
}

interface Lote {
  id: string;
  nome: string;
  precoCents: number;
  totalQty: number;
  sold: number;
  ordem: number;
  ativo: boolean;
  viradaAutomatica?: boolean;
}

interface Props {
  event: {
    id: string;
    slug: string;
    title: string;
    ticketTypes: TicketType[];
    lotes?: Lote[];
    activeLote?: Lote | null;
  };
}

export default function TicketSelector({ event }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const currentLote = event.activeLote || null;
  const hasLotes = (event.lotes?.length || 0) > 0;

  const lotesOrdenados = useMemo(() => {
    return [...(event.lotes || [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  }, [event.lotes]);

  /** Lotes já encerrados (histórico) — só nomes e esgotado */
  const lotesHistorico = useMemo(() => {
    return lotesOrdenados.filter((l) => {
      if (currentLote && l.id === currentLote.id) return false;
      const esgotado = !l.ativo || l.sold >= l.totalQty;
      return esgotado || !l.ativo;
    });
  }, [lotesOrdenados, currentLote]);

  // Estoque público: prioriza lote ativo; senão ticket type
  const primaryType = event.ticketTypes[0];
  const loteDisponivel = currentLote
    ? Math.max(0, currentLote.totalQty - currentLote.sold)
    : 0;

  const typeDisponivel = (tt: TicketType) => Math.max(0, tt.totalQty - tt.sold);

  const total = event.ticketTypes.reduce((sum, tt) => {
    const price = currentLote?.precoCents ?? tt.priceCents;
    return sum + (quantities[tt.id] || 0) * price;
  }, 0);

  const updateQty = (id: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[id] || 0;
      const tt = event.ticketTypes.find((t) => t.id === id);
      if (!tt) return prev;
      // Limite: o menor entre tipo e lote ativo
      const maxType = typeDisponivel(tt);
      const maxLote = currentLote ? loteDisponivel : maxType;
      // soma das outras quantidades no mesmo lote
      const others = Object.entries(prev)
        .filter(([k]) => k !== id)
        .reduce((s, [, q]) => s + q, 0);
      const max = currentLote
        ? Math.min(maxType, Math.max(0, maxLote - others))
        : maxType;
      const next = Math.max(0, Math.min(current + delta, max));
      return { ...prev, [id]: next };
    });
  };

  const hasSelection = Object.values(quantities).some((q) => q > 0);

  async function handleBuy() {
    if (!hasSelection) return;
    setLoading(true);

    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          items,
          ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido');

      if (data.promoApplied) {
        toast.success(
          `Cupom ${data.promoApplied} aplicado` +
            (data.discountCents
              ? ` (−${formatPrice(data.discountCents)})`
              : '')
        );
      }

      router.push(`/checkout/${data.orderId}`);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Falha ao iniciar compra');
    } finally {
      setLoading(false);
    }
  }

  // ——— UI: com lotes (recomendado) ———
  if (hasLotes) {
    const price = currentLote?.precoCents ?? primaryType?.priceCents ?? 0;
    const activeName = currentLote?.nome || 'Ingresso';
    const soldOutActive =
      !currentLote || loteDisponivel < 1 || (primaryType && typeDisponivel(primaryType) < 1);

    return (
      <div>
        {/* Histórico de lotes esgotados */}
        {lotesHistorico.length > 0 && (
          <div className="mb-5 space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
              Lotes anteriores
            </div>
            {lotesHistorico.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between py-2 px-3 rounded-xl bg-zinc-950/50 border border-white/5 text-sm"
              >
                <span className="text-zinc-500 line-through decoration-zinc-600">{l.nome}</span>
                <span className="text-[11px] text-red-400/90 font-medium">Esgotado</span>
              </div>
            ))}
          </div>
        )}

        {/* Lote ativo — título principal */}
        {currentLote && !soldOutActive ? (
          <div className="mb-2">
            <div className="flex justify-between items-start gap-3">
              <div>
                <div className="text-xl font-semibold tracking-tight text-white">{activeName}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-semibold tabular-nums">{formatPrice(price)}</div>
              </div>
            </div>

            {/* Quantidade — um seletor por tipo (em geral só 1) */}
            {event.ticketTypes.map((tt) => {
              const available = Math.min(
                typeDisponivel(tt),
                loteDisponivel
              );
              const qty = quantities[tt.id] || 0;
              // Só mostra nome do tipo se houver mais de um (VIP, pista…)
              const showTypeName = event.ticketTypes.length > 1;

              return (
                <div key={tt.id} className="mt-5">
                  {showTypeName && (
                    <div className="text-sm text-zinc-400 mb-2">{tt.name}</div>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateQty(tt.id, -1)}
                      className="w-9 h-9 flex items-center justify-center border border-white/20 rounded-lg active:bg-white/5"
                      disabled={qty === 0}
                    >
                      −
                    </button>
                    <div className="w-10 text-center font-mono text-lg tabular-nums">{qty}</div>
                    <button
                      type="button"
                      onClick={() => updateQty(tt.id, +1)}
                      className="w-9 h-9 flex items-center justify-center border border-white/20 rounded-lg active:bg-white/5"
                      disabled={qty >= available || available < 1}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 text-center text-red-400 bg-red-950/20 rounded-xl text-sm mb-4">
            {currentLote ? `${currentLote.nome} esgotado` : 'Sem lote ativo no momento'}
          </div>
        )}

        <div className="flex items-baseline justify-between py-4 border-t border-white/10 mt-4">
          <div className="text-sm text-zinc-400">TOTAL</div>
          <div className="text-3xl font-semibold tabular-nums tracking-tighter">
            {formatPrice(total)}
          </div>
        </div>

        <div className="mb-3">
          <label className="text-[11px] text-zinc-500 block mb-1">Cupom (opcional)</label>
          <input
            className="input w-full uppercase"
            placeholder="Código promocional"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          />
        </div>

        <button
          type="button"
          onClick={handleBuy}
          disabled={!hasSelection || loading || soldOutActive}
          className="btn btn-primary w-full text-base disabled:opacity-50"
        >
          {loading ? 'Processando...' : 'Continuar para o pagamento →'}
        </button>
        <div className="text-[10px] text-center text-zinc-500 mt-2">
          Você será redirecionado para o checkout seguro
        </div>
      </div>
    );
  }

  // ——— Fallback sem lotes: ticket types ———
  return (
    <div>
      {event.ticketTypes.map((tt) => {
        const price = tt.priceCents;
        const available = typeDisponivel(tt);
        const qty = quantities[tt.id] || 0;
        return (
          <div key={tt.id} className="mb-5 border-b border-white/10 pb-5 last:border-b-0 last:pb-0">
            <div className="flex justify-between">
              <div>
                <div className="font-medium">{tt.name}</div>
                {tt.description && (
                  <div className="text-xs text-zinc-400">{tt.description}</div>
                )}
                {available < 1 && <div className="text-xs mt-1 text-red-400">Esgotado</div>}
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatPrice(price)}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={() => updateQty(tt.id, -1)}
                className="w-9 h-9 flex items-center justify-center border border-white/20 rounded-lg active:bg-white/5"
                disabled={qty === 0 || available < 1}
              >
                −
              </button>
              <div className="w-10 text-center font-mono text-lg tabular-nums">{qty}</div>
              <button
                type="button"
                onClick={() => updateQty(tt.id, +1)}
                className="w-9 h-9 flex items-center justify-center border border-white/20 rounded-lg active:bg-white/5"
                disabled={qty >= available || available < 1}
              >
                +
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex items-baseline justify-between py-4">
        <div className="text-sm text-zinc-400">TOTAL</div>
        <div className="text-3xl font-semibold tabular-nums tracking-tighter">
          {formatPrice(total)}
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[11px] text-zinc-500 block mb-1">Cupom (opcional)</label>
        <input
          className="input w-full uppercase"
          placeholder="Código promocional"
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
        />
      </div>

      <button
        type="button"
        onClick={handleBuy}
        disabled={!hasSelection || loading}
        className="btn btn-primary w-full text-base disabled:opacity-50"
      >
        {loading ? 'Processando...' : 'Continuar para o pagamento →'}
      </button>
      <div className="text-[10px] text-center text-zinc-500 mt-2">
        Você será redirecionado para o checkout seguro
      </div>
    </div>
  );
}
