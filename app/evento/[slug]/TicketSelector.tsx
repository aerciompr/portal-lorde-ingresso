'use client';

import { useState } from 'react';
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

interface Props {
  event: {
    id: string;
    slug: string;
    title: string;
    ticketTypes: TicketType[];
    lotes?: any[];
    activeLote?: { id: string; nome: string; precoCents: number; totalQty: number; sold: number; viradaAutomatica: boolean; } | null;
  };
}

export default function TicketSelector({ event }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const currentLote = event.activeLote;
  const currentPrice = currentLote ? currentLote.precoCents : null;

  const total = event.ticketTypes.reduce((sum, tt) => {
    const price = currentPrice ?? tt.priceCents;
    return sum + (quantities[tt.id] || 0) * price;
  }, 0);

  const updateQty = (id: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[id] || 0;
      const tt = event.ticketTypes.find(t => t.id === id)!;
      const max = tt.totalQty - tt.sold;
      const next = Math.max(0, Math.min(current + delta, max));
      return { ...prev, [id]: next };
    });
  };

  const hasSelection = Object.values(quantities).some(q => q > 0);

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
        body: JSON.stringify({ eventId: event.id, items }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido');

      // Redirect to checkout page for this order
      router.push(`/checkout/${data.orderId}`);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Falha ao iniciar compra');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {event.ticketTypes.map((tt) => {
        const price = currentPrice ?? tt.priceCents;
        const available = tt.totalQty - tt.sold;
        const qty = quantities[tt.id] || 0;
        return (
          <div key={tt.id} className="mb-5 border-b border-white/10 pb-5 last:border-b-0 last:pb-0">
            <div className="flex justify-between">
              <div>
                <div className="font-medium">{tt.name}</div>
                {tt.description && <div className="text-xs text-zinc-400">{tt.description}</div>}
                <div className="text-xs mt-1 text-emerald-400">{available} disponíveis</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatPrice(price)}</div>
                {currentLote && <div className="text-[10px] text-zinc-400">{currentLote.nome}</div>}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => updateQty(tt.id, -1)}
                className="w-9 h-9 flex items-center justify-center border border-white/20 rounded-lg active:bg-white/5"
                disabled={qty === 0}
              >−</button>
              <div className="w-10 text-center font-mono text-lg tabular-nums">{qty}</div>
              <button
                onClick={() => updateQty(tt.id, +1)}
                className="w-9 h-9 flex items-center justify-center border border-white/20 rounded-lg active:bg-white/5"
                disabled={qty >= available}
              >+</button>
              <div className="ml-auto text-xs text-zinc-400">máx {available}</div>
            </div>
          </div>
        );
      })}

      <div className="flex items-baseline justify-between py-4">
        <div className="text-sm text-zinc-400">TOTAL</div>
        <div className="text-3xl font-semibold tabular-nums tracking-tighter">{formatPrice(total)}</div>
      </div>

      <button
        onClick={handleBuy}
        disabled={!hasSelection || loading}
        className="btn btn-primary w-full text-base disabled:opacity-50"
      >
        {loading ? "Processando..." : "Continuar para o pagamento →"}
      </button>
      <div className="text-[10px] text-center text-zinc-500 mt-2">Você será redirecionado para o checkout seguro</div>
    </div>
  );
}
