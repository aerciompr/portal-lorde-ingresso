'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';


/** Logo empacotada no app — sempre existe no deploy */
const STATIC_FALLBACK_LOGO = '/logo-lordenelson.jpg';

function uniqueUrls(...candidates: (string | undefined | null)[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const u = (c || '').trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export default function Header({
  initialBranding = {},
  whatsappDisplay,
  whatsappHref,
  showWhatsApp = true,
}: {
  initialBranding?: { siteName?: string; logoUrl?: string; faviconUrl?: string };
  whatsappDisplay?: string;
  whatsappHref?: string;
  /** false = esconde ícone no menu (config show_whatsapp) */
  showWhatsApp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [siteName, setSiteName] = useState(initialBranding.siteName || 'Lorde Nelson');
  const [remoteLogo, setRemoteLogo] = useState((initialBranding.logoUrl || '').trim());
  const [remoteFavicon, setRemoteFavicon] = useState((initialBranding.faviconUrl || '').trim());
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [waDisplay, setWaDisplay] = useState(whatsappDisplay || '');
  const [waHref, setWaHref] = useState(whatsappHref || '');
  const [waVisible, setWaVisible] = useState(
    Boolean(showWhatsApp && (whatsappHref || whatsappDisplay))
  );

  // Se o SSR veio sem logo (cache / falha de DB), busca nas configs públicas
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data) return;
        if (data.site_name) setSiteName(String(data.site_name));
        if (data.show_whatsapp != null) {
          const v = String(data.show_whatsapp).toLowerCase();
          setWaVisible(!['0', 'false', 'off', 'no'].includes(v));
        }
        if (data.logo_url) {
          setRemoteLogo(String(data.logo_url).trim());
          setCandidateIndex(0);
        }
        if (data.favicon_url) setRemoteFavicon(String(data.favicon_url).trim());
        if (data.whatsapp_display) setWaDisplay(String(data.whatsapp_display));
        if (data.whatsapp_e164) {
          const digits = String(data.whatsapp_e164).replace(/\D/g, '');
          if (digits) setWaHref(`https://wa.me/${digits}`);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  function WhatsAppIconLink({ className = '' }: { className?: string }) {
    return (
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={`WhatsApp ${waDisplay}`}
        title={`WhatsApp ${waDisplay}`}
      >
        <i className="fa-brands fa-whatsapp" aria-hidden />
      </a>
    );
  }

  const candidates = useMemo(
    () =>
      uniqueUrls(
        remoteLogo || initialBranding.logoUrl,
        remoteFavicon || initialBranding.faviconUrl,
        STATIC_FALLBACK_LOGO
      ),
    [remoteLogo, remoteFavicon, initialBranding.logoUrl, initialBranding.faviconUrl]
  );

  const logoSrc = candidates[Math.min(candidateIndex, candidates.length - 1)] || STATIC_FALLBACK_LOGO;

  /** Cardápio digital (Saipos) — abre em nova aba */
  const CARDAPIO_URL =
    'https://lordenelsonbar.saipos.com/lorde-nelson-1096-bar/table/dqmtsst';

  // Sem link “ADMIN” no site público (acesso só por /admin/login)
  const links: {
    href: string;
    label: string;
    className?: string;
    external?: boolean;
  }[] = [
    { href: '/#eventos', label: 'Eventos' },
    { href: '/eventos', label: 'Programação' },
    { href: CARDAPIO_URL, label: 'Cardápio', external: true },
    { href: '/ingressos', label: 'Meus Ingressos' },
    { href: '/contato', label: 'Contato' },
  ];

  function NavLink({
    l,
    onClick,
  }: {
    l: (typeof links)[number];
    onClick?: () => void;
  }) {
    const cls = l.className || 'hover:text-white transition';
    if (l.external) {
      return (
        <a
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className={cls}
          onClick={onClick}
        >
          {l.label}
        </a>
      );
    }
    return (
      <Link href={l.href} className={cls} onClick={onClick}>
        {l.label}
      </Link>
    );
  }

  return (
    <header className="border-b border-white/10 bg-zinc-950/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight text-xl hover:opacity-90 transition min-w-0"
        >
          {/* Só a imagem da logo — sem caixa/fundo/anel */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={logoSrc}
            src={logoSrc}
            alt={siteName}
            className="h-10 sm:h-11 w-auto max-w-[min(160px,42vw)] object-contain bg-transparent shrink-0"
            onError={() => {
              setCandidateIndex((i) => {
                if (i + 1 < candidates.length) return i + 1;
                return i;
              });
            }}
          />
        </Link>

        <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-[13px] font-semibold uppercase tracking-[2.5px] font-[family-name:var(--font-space-grotesk)]">
          {links.map((l, i) => (
            <NavLink key={i} l={l} />
          ))}
          {waVisible && (
            <WhatsAppIconLink className="text-[#25D366] hover:text-[#3be07a] text-[1.35rem] leading-none transition -mt-0.5" />
          )}
        </nav>

        <div className="flex md:hidden items-center gap-1">
          {waVisible && (
            <WhatsAppIconLink className="text-[#25D366] hover:text-[#3be07a] text-[1.5rem] leading-none p-2 transition" />
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="p-2 cursor-pointer"
            aria-label="Menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="md:hidden border-t border-white/10 bg-zinc-950 px-6 py-4 flex flex-col gap-4 text-[13px] font-semibold uppercase tracking-[2.5px] font-[family-name:var(--font-space-grotesk)]">
          {links.map((l, i) => (
            <NavLink key={i} l={l} onClick={() => setOpen(false)} />
          ))}
          {waVisible && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 normal-case tracking-normal text-[#25D366]"
              onClick={() => setOpen(false)}
            >
              <i className="fa-brands fa-whatsapp text-xl" aria-hidden />
              <span className="text-zinc-300 text-sm font-medium">{waDisplay}</span>
            </a>
          )}
        </nav>
      )}
    </header>
  );
}
