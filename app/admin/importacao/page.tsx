'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

type Step = 'events' | 'orders';

type PreviewEvents = {
  total: number;
  validCount: number;
  errorCount: number;
  fileName: string;
  rows: Array<{
    external_id: string;
    title: string;
    date: string;
    open_time: string;
    address: string;
    _row: number;
    _errors: string[];
  }>;
};

type PreviewOrders = {
  total: number;
  validCount: number;
  errorCount: number;
  orderCount: number;
  eventsMatched: number;
  eventsReferenced: number;
  fileName: string;
  truncated?: boolean;
  rows: Array<{
    external_id: string;
    event_external_id: string;
    ticket_name: string;
    price: string;
    qty: string;
    buyer_name: string;
    buyer_email: string;
    status: string;
    _row: number;
    _errors: string[];
  }>;
};

export default function AdminImportacaoPage() {
  const [step, setStep] = useState<Step>('events');
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewEvents, setPreviewEvents] = useState<PreviewEvents | null>(null);
  const [previewOrders, setPreviewOrders] = useState<PreviewOrders | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  function onPick(f: File | null) {
    setFile(f);
    setPreviewEvents(null);
    setPreviewOrders(null);
    setResult(null);
  }

  async function preview() {
    if (!file) {
      toast.error('Escolha um CSV');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'preview');
      const url =
        step === 'events' ? '/api/admin/import/events' : '/api/admin/import/orders';
      const res = await fetch(url, { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no preview');
      if (step === 'events') {
        setPreviewEvents(data);
        setPreviewOrders(null);
      } else {
        setPreviewOrders(data);
        setPreviewEvents(null);
      }
      toast.success('Pré-visualização pronta — confira a tabela abaixo');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function doImport() {
    if (!file) return;
    const msg =
      step === 'events'
        ? `Importar ${previewEvents?.validCount ?? 0} eventos válidos?`
        : `Importar ${previewOrders?.orderCount ?? 0} pedidos válidos? (cancelamento self-service desligado)`;
    if (!confirm(msg)) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'import');
      fd.append('replace', replace ? '1' : '0');
      const url =
        step === 'events' ? '/api/admin/import/events' : '/api/admin/import/orders';
      const res = await fetch(url, { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na importação');
      setResult(data);
      toast.success(
        step === 'events'
          ? `Eventos: +${data.created} criados, ${data.skipped} ignorados`
          : `Pedidos: +${data.created} criados, ${data.skipped} ignorados`
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importação WooCommerce (CSV)</h1>
        <p className="text-sm text-zinc-500 mt-1">
          1) Eventos → 2) Pedidos. Antes de gravar, o sistema mostra os dados para conferência.
          Queries SQL:{' '}
          <Link href="/docs/MIGRACAO_CSV_WOOCOMMERCE.md" className="text-emerald-400 hover:underline">
            docs/MIGRACAO_CSV_WOOCOMMERCE.md
          </Link>{' '}
          (arquivo no repositório).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setStep('events');
            onPick(null);
          }}
          className={`px-4 py-2 rounded-xl text-sm border transition ${
            step === 'events'
              ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
              : 'border-white/10 text-zinc-400'
          }`}
        >
          1. Eventos
        </button>
        <button
          type="button"
          onClick={() => {
            setStep('orders');
            onPick(null);
          }}
          className={`px-4 py-2 rounded-xl text-sm border transition ${
            step === 'orders'
              ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
              : 'border-white/10 text-zinc-400'
          }`}
        >
          2. Pedidos vendidos
        </button>
      </div>

      <div className="card p-5 space-y-4">
        <div className="text-sm text-zinc-400">
          {step === 'events' ? (
            <>
              Exporte <code className="text-zinc-300">eventos.csv</code> com a query da seção 1 do
              doc e envie aqui.
            </>
          ) : (
            <>
              Exporte <code className="text-zinc-300">pedidos.csv</code> (seção 2). Importe{' '}
              <strong className="text-zinc-300">eventos primeiro</strong>, senão linhas sem evento
              caem no fallback “Importado Woo”.
            </>
          )}
        </div>

        <div>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="text-sm text-zinc-300"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
          {file && (
            <div className="text-xs text-zinc-500 mt-1">
              Arquivo: {file.name} ({Math.round(file.size / 1024)} KB)
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
          />
          Substituir registros já importados (mesmo external_id)
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!file || loading}
            onClick={preview}
            className="btn btn-secondary disabled:opacity-50"
          >
            {loading ? '…' : 'Pré-visualizar dados'}
          </button>
          <button
            type="button"
            disabled={
              loading ||
              !file ||
              (step === 'events' ? !previewEvents?.validCount : !previewOrders?.validCount)
            }
            onClick={doImport}
            className="btn btn-primary disabled:opacity-50"
          >
            {step === 'events' ? 'Importar eventos' : 'Importar pedidos'}
          </button>
        </div>
      </div>

      {/* Preview eventos */}
      {previewEvents && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-300">
              {previewEvents.total} linhas
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
              {previewEvents.validCount} válidas
            </span>
            <span className="px-3 py-1 rounded-full bg-red-500/15 text-red-400">
              {previewEvents.errorCount} com erro
            </span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10 max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">external_id</th>
                  <th className="p-2">title</th>
                  <th className="p-2">date</th>
                  <th className="p-2">hora</th>
                  <th className="p-2">erros</th>
                </tr>
              </thead>
              <tbody>
                {previewEvents.rows.map((r) => (
                  <tr
                    key={r._row}
                    className={
                      r._errors.length
                        ? 'bg-red-950/20 border-t border-white/5'
                        : 'border-t border-white/5'
                    }
                  >
                    <td className="p-2 text-zinc-500">{r._row}</td>
                    <td className="p-2 font-mono">{r.external_id}</td>
                    <td className="p-2">{r.title}</td>
                    <td className="p-2 whitespace-nowrap">{r.date}</td>
                    <td className="p-2">{r.open_time}</td>
                    <td className="p-2 text-red-400">{r._errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview pedidos */}
      {previewOrders && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-300">
              {previewOrders.total} linhas
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
              {previewOrders.validCount} válidas
            </span>
            <span className="px-3 py-1 rounded-full bg-sky-500/15 text-sky-300">
              {previewOrders.orderCount} pedidos
            </span>
            <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-300">
              eventos no CSV: {previewOrders.eventsReferenced} · achados no portal:{' '}
              {previewOrders.eventsMatched}
            </span>
            <span className="px-3 py-1 rounded-full bg-red-500/15 text-red-400">
              {previewOrders.errorCount} com erro
            </span>
          </div>
          {previewOrders.eventsMatched < previewOrders.eventsReferenced && (
            <div className="text-sm text-amber-300 bg-amber-950/30 border border-amber-500/20 rounded-xl px-4 py-3">
              Alguns <code>event_external_id</code> não existem no portal. Importe o CSV de eventos
              primeiro ou essas linhas usarão o evento fallback.
            </div>
          )}
          {previewOrders.truncated && (
            <div className="text-xs text-zinc-500">
              Tabela mostra as primeiras 500 linhas; o import usa o arquivo inteiro.
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border border-white/10 max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">pedido</th>
                  <th className="p-2">evento</th>
                  <th className="p-2">ingresso</th>
                  <th className="p-2">R$</th>
                  <th className="p-2">qty</th>
                  <th className="p-2">cliente</th>
                  <th className="p-2">e-mail</th>
                  <th className="p-2">status</th>
                  <th className="p-2">erros</th>
                </tr>
              </thead>
              <tbody>
                {previewOrders.rows.map((r) => (
                  <tr
                    key={`${r._row}-${r.external_id}`}
                    className={
                      r._errors.length
                        ? 'bg-red-950/20 border-t border-white/5'
                        : 'border-t border-white/5'
                    }
                  >
                    <td className="p-2 text-zinc-500">{r._row}</td>
                    <td className="p-2 font-mono">{r.external_id}</td>
                    <td className="p-2 font-mono">{r.event_external_id || '—'}</td>
                    <td className="p-2 max-w-[140px] truncate">{r.ticket_name}</td>
                    <td className="p-2">{r.price}</td>
                    <td className="p-2">{r.qty}</td>
                    <td className="p-2 max-w-[120px] truncate">{r.buyer_name}</td>
                    <td className="p-2 max-w-[160px] truncate">{r.buyer_email}</td>
                    <td className="p-2">{r.status}</td>
                    <td className="p-2 text-red-400">{r._errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <pre className="text-xs bg-zinc-950 border border-white/10 rounded-2xl p-4 overflow-x-auto text-zinc-400">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <div className="text-xs text-zinc-600 leading-relaxed">
        Doc completo com SQL copiável:{' '}
        <code className="text-zinc-400">docs/MIGRACAO_CSV_WOOCOMMERCE.md</code> no repositório.
        Pedidos migrados não aceitam cancelamento pelo cliente no Meus Ingressos.
      </div>
    </div>
  );
}
