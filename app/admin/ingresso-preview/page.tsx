'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';

/**
 * Prévia visual do layout do ingresso (espelha lib/generate-ticket.ts).
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
            Prévia do PDF (600×340). Baixe o arquivo real gerado pelo sistema.
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

      {/* Mock do cartão PDF */}
      <div
        className="relative mx-auto overflow-hidden rounded-xl shadow-2xl border border-white/10"
        style={{
          width: 'min(100%, 600px)',
          aspectRatio: '600 / 340',
          background: '#0f0f12',
        }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />

        <div className="absolute left-0 right-0 top-0 h-[17.6%] bg-[#fafafa] flex items-center justify-between px-7">
          <span className="text-[13px] font-bold tracking-wide text-zinc-900">
            LORDE NELSON • REST PUB
          </span>
          <span className="text-[12px] text-zinc-500 tracking-wide">INGRESSO</span>
        </div>

        <div className="absolute left-0 right-0 top-[17.6%] bottom-0 pl-7 pr-4 pt-4 pb-3 flex">
          <div className="flex-1 min-w-0 pr-3">
            <div className="text-lg font-bold text-white tracking-tight leading-tight">
              Especial Beatles
            </div>
            <div className="text-[12px] text-zinc-400 mt-1.5">
              domingo, 12 de julho de 2026 • 20:00
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
              Rua Silvério Jorge, 241, Jaraguá, Maceió - AL
            </div>

            <div className="mt-5">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">Nome</div>
              <div className="text-sm font-bold text-white">João da Silva</div>
            </div>
            <div className="mt-3">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">E-mail</div>
              <div className="text-[11px] text-zinc-300">joao@email.com</div>
            </div>

            <div className="mt-4 text-xs font-bold text-emerald-400">Ingresso Padrão</div>

            <div className="absolute bottom-4 left-7 font-mono text-xl font-bold tracking-wider text-zinc-100">
              LN-DEMO0001
            </div>
          </div>

          <div className="flex flex-col items-center justify-between pb-1 shrink-0 w-[38%] pt-0">
            {/* Poster do evento */}
            <div className="w-full max-w-[132px] h-[100px] rounded-md overflow-hidden border border-white/10 bg-zinc-800 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-lordenelson.jpg"
                alt="Evento"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="bg-white p-1.5 rounded-md w-full max-w-[100px] aspect-square flex items-center justify-center mt-2">
              <svg viewBox="0 0 100 100" className="w-full h-full text-black">
                <rect width="100" height="100" fill="white" />
                <rect x="8" y="8" width="28" height="28" fill="black" />
                <rect x="12" y="12" width="20" height="20" fill="white" />
                <rect x="16" y="16" width="12" height="12" fill="black" />
                <rect x="64" y="8" width="28" height="28" fill="black" />
                <rect x="68" y="12" width="20" height="20" fill="white" />
                <rect x="72" y="16" width="12" height="12" fill="black" />
                <rect x="8" y="64" width="28" height="28" fill="black" />
                <rect x="12" y="68" width="20" height="20" fill="white" />
                <rect x="16" y="72" width="12" height="12" fill="black" />
                <rect x="48" y="48" width="8" height="8" fill="black" />
                <rect x="60" y="48" width="8" height="8" fill="black" />
                <rect x="48" y="60" width="8" height="8" fill="black" />
                <rect x="72" y="56" width="12" height="12" fill="black" />
                <rect x="56" y="72" width="16" height="8" fill="black" />
              </svg>
            </div>
            <div className="text-[7px] text-zinc-500 mt-1 tracking-wide text-center">
              APRESENTE ESTE QR NO LOCAL
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={downloadSamplePdf}
          disabled={downloading}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          <Download size={16} />
          {downloading ? 'Gerando...' : 'Baixar PDF de exemplo'}
        </button>
        <a href="/admin/pedidos" className="btn btn-secondary text-sm">
          Baixar PDF de pedidos reais →
        </a>
      </div>

      <div className="mt-8 card p-5 text-sm text-zinc-400 space-y-3">
        <div className="font-medium text-zinc-200">Downloads no admin</div>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-zinc-300">Imagem do evento:</strong> o poster cadastrado no evento aparece no PDF
            (PNG/JPG). WebP externo pode não embutir — prefira JPG/PNG no upload.
          </li>
          <li>
            <strong className="text-zinc-300">Aqui:</strong> PDF de exemplo (usa imagem do último evento com foto, se
            houver).
          </li>
          <li>
            <strong className="text-zinc-300">Pedidos:</strong> PDF real com a imagem daquele evento.
          </li>
        </ul>
      </div>
    </div>
  );
}
