'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';

/**
 * Prévia visual do layout do ingresso (espelha lib/generate-ticket.ts — retrato).
 * Rota: /admin/ingresso-preview — só admin (layout).
 */
export default function IngressoPreviewPage() {
  const [downloading, setDownloading] = useState(false);

  async function downloadSamplePdf() {
    setDownloading(true);
    try {
      const res = await fetch('/api/admin/ticket-preview-pdf');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao gerar PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ingresso-preview-lordenelson.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('PDF baixado');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Erro no download');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Layout do ingresso</h1>
          <p className="text-sm text-zinc-400 mt-1">
            PDF em <strong className="text-zinc-300">retrato (vertical)</strong> 360×640 — QR
            grande para leitura. Baixe o arquivo real gerado pelo sistema.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadSamplePdf}
          disabled={downloading}
          className="btn btn-primary inline-flex items-center gap-2 whitespace-nowrap"
        >
          <Download size={16} />
          {downloading ? 'Gerando PDF...' : 'Baixar PDF de exemplo'}
        </button>
      </div>

      {/* Mock do cartão PDF vertical */}
      <div
        className="relative mx-auto overflow-hidden rounded-xl shadow-2xl border border-white/10"
        style={{
          width: 'min(100%, 280px)',
          aspectRatio: '360 / 640',
          background: '#0f0f12',
        }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />

        <div className="absolute left-0 right-0 top-0 h-[8%] bg-[#fafafa] flex items-center justify-between px-4">
          <span className="text-[10px] font-bold tracking-wide text-zinc-900">
            LORDE NELSON • REST PUB
          </span>
          <span className="text-[9px] text-zinc-500 tracking-wide">INGRESSO</span>
        </div>

        <div className="absolute left-0 right-0 top-[8%] bottom-0 px-4 pt-3 pb-3 flex flex-col">
          <div className="h-[22%] rounded-lg bg-zinc-800 border border-white/10 mb-2 flex items-center justify-center text-zinc-600 text-[10px]">
            Arte do evento
          </div>
          <div className="text-sm font-bold text-white tracking-tight leading-tight">
            Especial Beatles
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">sábado, 15 ago · 20h</div>
          <div className="text-[9px] text-zinc-500 mt-0.5">Rua Silvério Jorge, 241</div>

          <div className="mt-3 text-[8px] text-zinc-500 uppercase tracking-wider">Nome</div>
          <div className="text-xs font-semibold text-white">Cliente Exemplo</div>
          <div className="mt-2 text-[8px] text-zinc-500 uppercase tracking-wider">E-mail</div>
          <div className="text-[10px] text-zinc-300">cliente@email.com</div>
          <div className="mt-2 text-[11px] font-semibold text-emerald-400">Lote 1</div>

          <div className="mt-auto flex flex-col items-center">
            <div className="w-[55%] aspect-square bg-white rounded-md flex items-center justify-center text-[9px] text-zinc-400 border border-zinc-200">
              QR
            </div>
            <div className="mt-2 text-[11px] font-bold text-white tracking-wide">LN-XXXXXXX</div>
            <div className="text-[7px] text-zinc-500 mt-1">APRESENTE ESTE QR NO LOCAL</div>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-zinc-500 mt-4">
        Na impressão, use “Ajustar à página” ou escala ~100%. O ideal é 1 ingresso por folha A4
        (centralizado) ou recortar o cartão.
      </p>
    </div>
  );
}
