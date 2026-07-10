'use client';

import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type RechartsModule = typeof import('recharts');

interface LoteSales {
  name: string;
  gross: number;
  net: number;
  tickets: number;
  refunds: number;
}

export default function Reports() {
  const [data, setData] = useState<LoteSales[]>([]);
  const [summary, setSummary] = useState({ gross: 0, net: 0, tickets: 0, refunds: 0 });
  const [Recharts, setRecharts] = useState<RechartsModule | null>(null);

  useEffect(() => {
    // Lazy load Recharts only on client to reduce initial bundle size and RAM usage
    import('recharts').then(setRecharts);
  }, []);

  useEffect(() => {
    fetch('/api/admin/orders').then(r => r.json()).then((orders: Array<{
      status: string; 
      totalCents: number; 
      grossCents?: number;
      netCents?: number;
      feeCents?: number;
      event?: {title?: string};
      lote?: {nome?: string};
    }>) => {
      const byLote: Record<string, LoteSales> = {};
      let g = 0, n = 0, tix = 0, ref = 0;
      orders.forEach((o) => {
        const loteName = o.lote?.nome || o.event?.title || 'Sem lote';
        if (!byLote[loteName]) byLote[loteName] = { name: loteName, gross: 0, net: 0, tickets: 0, refunds: 0 };
        const gross = o.grossCents || o.totalCents;
        const net = o.netCents || o.totalCents;
        byLote[loteName].gross += gross;
        byLote[loteName].net += net;
        byLote[loteName].tickets += 1;
        if (o.status === 'refunded') {
          byLote[loteName].refunds += gross;
          ref += gross;
        }
        g += gross;
        n += net;
        if (o.status === 'paid') tix += 1;
      });
      setData(Object.values(byLote));
      setSummary({ gross: g, net: n, tickets: tix, refunds: ref });
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios Gerenciais</h1>
        <p className="text-sm text-zinc-400">Bruto × Líquido por lote • Totais de estornos • Visão BI simples (Recharts)</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Bruto total</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1">{formatPrice(summary.gross)}</div>
        </div>
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Líquido total</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1 text-emerald-400">{formatPrice(summary.net)}</div>
        </div>
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Estornos</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1 text-red-400">{formatPrice(summary.refunds)}</div>
        </div>
        <div className="card p-6">
          <div className="text-xs text-zinc-500">Ingressos pagos</div>
          <div className="text-4xl font-semibold tracking-tighter mt-1">{summary.tickets}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="card p-7 lg:col-span-3">
          <div className="mb-3 font-medium text-sm">Bruto por Lote</div>
          <div className="h-80">
            {Recharts ? (
              <Recharts.ResponsiveContainer width="100%" height={320}>
                <Recharts.BarChart data={data}>
                  <Recharts.XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <Recharts.YAxis />
                  <Recharts.Tooltip />
                  <Recharts.Bar dataKey="gross" fill="#22c55e" radius={4} />
                </Recharts.BarChart>
              </Recharts.ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">Carregando gráfico...</div>
            )}
          </div>
        </div>

        <div className="card p-7 lg:col-span-2">
          <div className="mb-3 font-medium text-sm">Resumo Financeiro por Lote</div>
          <div className="space-y-3 text-sm">
            {data.slice(0, 8).map((row, i) => (
              <div key={i} className="flex justify-between border-b border-white/10 pb-2">
                <div>{row.name}</div>
                <div className="text-right">
                  <div>{formatPrice(row.gross)}</div>
                  <div className="text-xs text-emerald-400">Líquido: {formatPrice(row.net)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-zinc-500 mt-4">Taxas calculadas no momento do pagamento (Pix / Cartão). Dados atualizados em tempo real.</div>
        </div>
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        Para mais filtros e export CSV completo, podemos expandir rapidamente.
      </div>
    </div>
  );
}
