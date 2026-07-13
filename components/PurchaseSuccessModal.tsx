'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Mail, X } from 'lucide-react';
import { toast } from 'sonner';

export type PurchaseModalVariant = 'pix-ready' | 'paid' | 'welcome';

type Props = {
  open: boolean;
  onClose: () => void;
  variant: PurchaseModalVariant;
  accessCode?: string | null;
  email?: string | null;
  eventTitle?: string | null;
  /** IDs de tickets para download PDF (pós-pago) */
  ticketIds?: string[];
  orderAccessCode?: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  autoRedirectSec?: number;
};

export default function PurchaseSuccessModal({
  open,
  onClose,
  variant,
  accessCode,
  email,
  eventTitle,
  ticketIds = [],
  orderAccessCode,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  autoRedirectSec = 0,
}: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(autoRedirectSec);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || variant !== 'paid' || !autoRedirectSec) {
      setLeft(autoRedirectSec);
      return;
    }
    setLeft(autoRedirectSec);
    const t = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          clearInterval(t);
          onPrimary();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [open, variant, autoRedirectSec, onPrimary]);

  if (!open) return null;

  // Modal de "PIX gerado" não deve distrair — só pós-pago / welcome
  if (variant === 'pix-ready') return null;

  async function copyCode() {
    if (!accessCode) return;
    try {
      await navigator.clipboard.writeText(accessCode);
      setCopied(true);
      toast.success('Código de acesso copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.message(accessCode);
    }
  }

  async function downloadTickets() {
    if (!ticketIds.length) {
      toast.message('Abra Meus Ingressos para baixar o PDF');
      onPrimary();
      return;
    }
    setDownloading(true);
    try {
      for (const tid of ticketIds) {
        const q = new URLSearchParams();
        if (orderAccessCode) q.set('code', orderAccessCode);
        const url = `/api/tickets/${tid}/pdf${q.toString() ? `?${q}` : ''}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Falha no download');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ingresso-${tid.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      toast.success(ticketIds.length > 1 ? 'PDFs baixados' : 'PDF baixado');
    } catch {
      toast.error('Não foi possível baixar. Use Meus Ingressos.');
    } finally {
      setDownloading(false);
    }
  }

  const title =
    variant === 'paid' || variant === 'welcome'
      ? 'Obrigado pela compra!'
      : 'Pagamento confirmado!';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-modal-title"
      onClick={onClose}
    >
      <div
        id="purchase-success-modal"
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 bg-emerald-500/15 text-emerald-400 ring-emerald-500/30">
              <Check size={22} />
            </span>
            <div className="min-w-0">
              <h2 id="purchase-modal-title" className="text-lg font-semibold text-white tracking-tight">
                {title}
              </h2>
              {eventTitle && (
                <p className="text-xs text-zinc-500 truncate mt-0.5">{eventTitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-zinc-300 mb-4 leading-relaxed">
          Seu pagamento foi confirmado. Guarde o código abaixo para acessar{' '}
          <strong className="text-white">Meus Ingressos</strong>.
        </p>

        {accessCode ? (
          <div className="mb-4 rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3 text-center">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mb-1.5">
              Código de acesso
            </div>
            <div className="font-mono text-xl font-semibold tracking-widest text-white select-all">
              {accessCode}
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar código de acesso'}
            </button>
          </div>
        ) : null}

        <div className="flex items-start gap-2 text-sm text-zinc-400 mb-5">
          <Mail size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <span>
            {email
              ? `Enviamos o ingresso por e-mail para ${email}. Confira também a pasta de spam.`
              : 'Enviamos o ingresso por e-mail. Confira a caixa de entrada e o spam.'}
          </span>
        </div>

        <div className="space-y-2">
          {ticketIds.length > 0 && (
            <button
              type="button"
              onClick={downloadTickets}
              disabled={downloading}
              className="w-full py-3 rounded-2xl border border-white/10 text-zinc-200 text-sm font-medium hover:bg-white/5 transition inline-flex items-center justify-center gap-2"
            >
              <Download size={16} />
              {downloading ? 'Baixando…' : 'Baixar ingresso (PDF)'}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={onPrimary}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition"
          >
            {primaryLabel}
            {left > 0 && autoRedirectSec > 0 ? ` (${left}s)` : ''}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="w-full py-3 rounded-2xl border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
