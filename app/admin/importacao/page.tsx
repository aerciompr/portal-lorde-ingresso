'use client';

import { useState } from 'react';
import { toast } from 'sonner';

type Step = 'events' | 'lotes' | 'orders';

export default function AdminImportacaoPage() {
  const [step, setStep] = useState<Step>('events');
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [downloadImages, setDownloadImages] = useState(true);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  function endpoint() {
    if (step === 'events') return '/api/admin/import/events';
    if (step === 'lotes') return '/api/admin/import/lotes';
    return '/api/admin/import/orders';
  }

  function onPick(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
  }

  async function previewCsv() {
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
      const res = await fetch(endpoint(), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no preview');
      setPreview(data);
      toast.success('Pré-visualização pronta — confira a tabela');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function doImport() {
    if (!file || !preview) return;
    const valid = Number(preview.validCount || 0);
    if (!valid) {
      toast.error('Nenhuma linha válida para importar');
      return;
    }
    const labels = {
      events: 'eventos',
      lotes: 'lotes',
      orders: 'pedidos',
    };
    if (!confirm(`Importar ${valid} linhas de ${labels[step]}?`)) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'import');
      fd.append('replace', replace ? '1' : '0');
      if (step === 'events') {
        fd.append('download_images', downloadImages ? '1' : '0');
      }
      const res = await fetch(endpoint(), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na importação');
      setResult(data);
      toast.success(
        `OK: +${data.created ?? 0} criados · ${data.skipped ?? 0} ignorados` +
          (data.imagesOk != null ? ` · fotos ${data.imagesOk}` : '')
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const rows = (preview?.rows as Array<Record<string, unknown>>) || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importação WooCommerce (CSV)</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Ordem: <strong className="text-zinc-300">1. Eventos</strong> (com fotos) →{' '}
          <strong className="text-zinc-300">2. Lotes</strong> (preços, estoque, esgotados) →{' '}
          <strong className="text-zinc-300">3. Pedidos</strong>. Sempre pré-visualize antes de gravar.
        </p>
        <p className="text-xs text-zinc-600 mt-1">
          SQL no repo: <code className="text-zinc-400">scripts/export-woo/</code> · Doc:{' '}
          <code className="text-zinc-400">docs/MIGRACAO_CSV_WOOCOMMERCE.md</code>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'events' as Step, label: '1. Eventos + fotos' },
            { id: 'lotes' as Step, label: '2. Lotes / preços' },
            { id: 'orders' as Step, label: '3. Pedidos vendidos' },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setStep(s.id);
              onPick(null);
            }}
            className={`px-4 py-2 rounded-xl text-sm border transition ${
              step === s.id
                ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                : 'border-white/10 text-zinc-400'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="card p-5 space-y-4">
        <div className="text-sm text-zinc-400">
          {step === 'events' && (
            <>
              CSV de <code className="text-zinc-300">01_eventos.sql</code> (colunas include{' '}
              <code className="text-zinc-300">image_url</code>). O import pode baixar as imagens
              para o storage do portal.
            </>
          )}
          {step === 'lotes' && (
            <>
              CSV de <code className="text-zinc-300">01b_lotes.sql</code>: preço real, capacity,
              stock, sold, sold_out. Cria <strong className="text-zinc-300">Lote</strong> +{' '}
              <strong className="text-zinc-300">TicketType</strong>. Esgotados ficam com{' '}
              <code className="text-zinc-300">ativo=false</code>.
            </>
          )}
          {step === 'orders' && (
            <>
              CSV de <code className="text-zinc-300">02_pedidos.sql</code>. Liga ao lote/produto via{' '}
              <code className="text-zinc-300">product_external_id</code>. Sem cancelamento
              self-service.
            </>
          )}
        </div>

        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="text-sm text-zinc-300"
          onChange={(e) => onPick(e.target.files?.[0] || null)}
        />
        {file && (
          <div className="text-xs text-zinc-500">
            {file.name} ({Math.round(file.size / 1024)} KB)
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Substituir já importados
          </label>
          {step === 'events' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={downloadImages}
                onChange={(e) => setDownloadImages(e.target.checked)}
              />
              Baixar fotos dos eventos
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!file || loading}
            onClick={previewCsv}
            className="btn btn-secondary disabled:opacity-50"
          >
            {loading ? '…' : 'Pré-visualizar todos os dados'}
          </button>
          <button
            type="button"
            disabled={loading || !preview || !Number(preview.validCount || 0)}
            onClick={doImport}
            className="btn btn-primary disabled:opacity-50"
          >
            Confirmar importação
          </button>
        </div>
      </div>

      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Chip>{String(preview.total)} linhas</Chip>
            <Chip tone="ok">{String(preview.validCount)} válidas</Chip>
            <Chip tone="bad">{String(preview.errorCount)} erros</Chip>
            {preview.orderCount != null && (
              <Chip tone="sky">{String(preview.orderCount)} pedidos</Chip>
            )}
            {preview.soldOutCount != null && (
              <Chip tone="amber">{String(preview.soldOutCount)} esgotados</Chip>
            )}
            {preview.withImageUrl != null && (
              <Chip tone="sky">{String(preview.withImageUrl)} com foto</Chip>
            )}
            {preview.eventsMatched != null && (
              <Chip tone="amber">
                eventos CSV {String(preview.eventsReferenced)} · no portal{' '}
                {String(preview.eventsMatched)}
              </Chip>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 max-h-[520px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-zinc-900 text-zinc-400 z-10">
                <tr>
                  {step === 'events' && (
                    <>
                      <th className="p-2">#</th>
                      <th className="p-2">id</th>
                      <th className="p-2">título</th>
                      <th className="p-2">data</th>
                      <th className="p-2">foto</th>
                      <th className="p-2">erros</th>
                    </>
                  )}
                  {step === 'lotes' && (
                    <>
                      <th className="p-2">#</th>
                      <th className="p-2">produto</th>
                      <th className="p-2">evento</th>
                      <th className="p-2">nome</th>
                      <th className="p-2">R$</th>
                      <th className="p-2">cap</th>
                      <th className="p-2">stock</th>
                      <th className="p-2">sold</th>
                      <th className="p-2">esgotado</th>
                      <th className="p-2">erros</th>
                    </>
                  )}
                  {step === 'orders' && (
                    <>
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
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const errs = (r._errors as string[]) || [];
                  const bad = errs.length > 0;
                  return (
                    <tr
                      key={String(r._row) + String(r.external_id || r.product_external_id || '')}
                      className={
                        bad ? 'bg-red-950/20 border-t border-white/5' : 'border-t border-white/5'
                      }
                    >
                      {step === 'events' && (
                        <>
                          <td className="p-2 text-zinc-500">{String(r._row)}</td>
                          <td className="p-2 font-mono">{String(r.external_id)}</td>
                          <td className="p-2 max-w-[200px] truncate">{String(r.title)}</td>
                          <td className="p-2 whitespace-nowrap">{String(r.date)}</td>
                          <td className="p-2">
                            {r.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={String(r.image_url)}
                                alt=""
                                className="h-10 w-8 object-cover rounded"
                              />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-2 text-red-400">{errs.join('; ')}</td>
                        </>
                      )}
                      {step === 'lotes' && (
                        <>
                          <td className="p-2 text-zinc-500">{String(r._row)}</td>
                          <td className="p-2 font-mono">{String(r.product_external_id)}</td>
                          <td className="p-2 font-mono">{String(r.event_external_id)}</td>
                          <td className="p-2 max-w-[180px] truncate">{String(r.nome)}</td>
                          <td className="p-2">{String(r.price)}</td>
                          <td className="p-2">{String(r.capacity)}</td>
                          <td className="p-2">{String(r.stock)}</td>
                          <td className="p-2">{String(r.sold)}</td>
                          <td className="p-2">
                            {r.sold_out === '1' ? (
                              <span className="text-amber-400">sim</span>
                            ) : (
                              'não'
                            )}
                          </td>
                          <td className="p-2 text-red-400">{errs.join('; ')}</td>
                        </>
                      )}
                      {step === 'orders' && (
                        <>
                          <td className="p-2 text-zinc-500">{String(r._row)}</td>
                          <td className="p-2 font-mono">{String(r.external_id)}</td>
                          <td className="p-2 font-mono">{String(r.event_external_id || '—')}</td>
                          <td className="p-2 max-w-[140px] truncate">{String(r.ticket_name)}</td>
                          <td className="p-2">{String(r.price)}</td>
                          <td className="p-2">{String(r.qty)}</td>
                          <td className="p-2 max-w-[120px] truncate">{String(r.buyer_name)}</td>
                          <td className="p-2 max-w-[150px] truncate">{String(r.buyer_email)}</td>
                          <td className="p-2">{String(r.status)}</td>
                          <td className="p-2 text-red-400">{errs.join('; ')}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
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
    </div>
  );
}

function Chip({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'ok' | 'bad' | 'sky' | 'amber';
}) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-500/15 text-emerald-400'
      : tone === 'bad'
        ? 'bg-red-500/15 text-red-400'
        : tone === 'sky'
          ? 'bg-sky-500/15 text-sky-300'
          : tone === 'amber'
            ? 'bg-amber-500/15 text-amber-300'
            : 'bg-zinc-800 text-zinc-300';
  return <span className={`px-3 py-1 rounded-full text-sm ${cls}`}>{children}</span>;
}
