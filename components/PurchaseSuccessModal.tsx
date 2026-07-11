'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Mail, QrCode, Ticket, UserX, X } from 'lucide-react';
import { toast } from 'sonner';

export type PurchaseModalVariant = 'pix-ready' | 'paid' | 'welcome';

type Props = {
  open: boolean;
  onClose: () => void;
  variant: PurchaseModalVariant;
  accessCode?: string | null;
  email?: string | null;
  eventTitle?: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Auto redirect countdown (seconds) for variant=paid; 0 = off */
  autoRedirectSec?: number;
};

const TITLES: Record<PurchaseModalVariant, string> = {
  'pix-ready': 'PIX gerado',
  paid: 'Pagamento confirmado!',
  welcome: 'Seu ingresso está pronto',
};

export default function PurchaseSuccessModal({
  open,
  onClose,
  variant,
  accessCode,
  email,
  eventTitle,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  autoRedirectSec = 0,
}: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(autoRedirectSec);

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
      // Tab cycle simples dentro do dialog
      if (e.key === 'Tab') {
        const root = document.getElementById('purchase-success-modal');
        if (!root) return;
        const focusable = root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
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

  async function copyCode() {
    if (!accessCode) return;
    try {
      await navigator.clipboard.writeText(accessCode);
      setCopied(true);
      toast.success('Código copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.message(accessCode);
    }
  }

  const emailLine =
    variant === 'pix-ready'
      ? email
        ? `Após pagar, enviaremos o PDF e o código para ${email}.`
        : 'Após pagar, enviaremos o PDF e o código por e-mail.'
      : email
        ? `Enviamos (ou enviaremos em instantes) o PDF para ${email}. Confira a caixa de entrada e o spam.`
        : 'Enviamos o PDF por e-mail. Confira a caixa de entrada e o spam.';

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
            <span
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                variant === 'pix-ready'
                  ? 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
              }`}
            >
              {variant === 'pix-ready' ? <Ticket size={22} /> : <Check size={22} />}
            </span>
            <div className="min-w-0">
              <h2 id="purchase-modal-title" className="text-lg font-semibold text-white tracking-tight">
                {TITLES[variant]}
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

        {/* Código em destaque */}
        {accessCode ? (
          <div className="mb-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-4 text-center">
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400/90 mb-2">
              Seu código de acesso
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-semibold tracking-[0.18em] text-emerald-300 select-all">
              {accessCode}
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 hover:text-white"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar código'}
            </button>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              Guarde este código. Use em <strong className="text-zinc-300">Meus Ingressos</strong> se
              fechar a página.
            </p>
          </div>
        ) : (
          <div className="mb-4 rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400 text-center">
            O código de acesso aparece assim que o pagamento for confirmado.
          </div>
        )}

        <ul className="space-y-2.5 text-sm text-zinc-300 mb-5">
          <li className="flex gap-2.5 items-start">
            <UserX size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong className="text-white">Não precisa criar conta.</strong> Use o código LN ou, se
              quiser, crie senha depois em Meus Ingressos.
            </span>
          </li>
          <li className="flex gap-2.5 items-start">
            <Mail size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <span>{emailLine}</span>
          </li>
          {(variant === 'paid' || variant === 'welcome') && (
            <li className="flex gap-2.5 items-start">
              <QrCode size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Na entrada, toque em <strong className="text-white">Mostrar QR</strong> neste celular
                (aumente o brilho se a portaria pedir).
              </span>
            </li>
          )}
          {variant === 'pix-ready' && (
            <li className="flex gap-2.5 items-start text-zinc-400 text-xs leading-relaxed pl-6">
              Após pagar o PIX, a confirmação é automática. Não precisa fazer nada além de pagar.
            </li>
          )}
        </ul>

        <div className="space-y-2">
          <button
            ref={primaryRef}
            type="button"
            onClick={onPrimary}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition"
          >
            {primaryLabel}
            {variant === 'paid' && left > 0 && autoRedirectSec > 0 ? ` (${left}s)` : ''}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="w-full py-3 rounded-2xl border border-white/10 text-zinc-300 text-sm font-medium hover:bg-white/5 transition"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
