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
}: {
  initialBranding?: { siteName?: string; logoUrl?: string; faviconUrl?: string };
}) {
  const [open, setOpen] = useState(false);
  const [siteName, setSiteName] = useState(initialBranding.siteName || 'Lorde Nelson');
  const [remoteLogo, setRemoteLogo] = useState((initialBranding.logoUrl || '').trim());
  const [remoteFavicon, setRemoteFavicon] = useState((initialBranding.faviconUrl || '').trim());
  const [candidateIndex, setCandidateIndex] = useState(0);

  // Se o SSR veio sem logo (cache / falha de DB), busca nas configs públicas
  useEffect(() => {
    let cancelled = false;
    const needFetch = !(initialBranding.logoUrl || '').trim();
    if (!needFetch) return;

    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data) return;
        if (data.site_name) setSiteName(String(data.site_name));
        if (data.logo_url) {
          setRemoteLogo(String(data.logo_url).trim());
          setCandidateIndex(0);
        }
        if (data.favicon_url) setRemoteFavicon(String(data.favicon_url).trim());
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [initialBranding.logoUrl]);

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

  const links = [
    { href: '/eventos', label: 'Programação' },
    { href: '/ingressos', label: 'Meus Ingressos' },
    {
      href: '/admin',
      label: 'ADMIN',
      className:
        'px-4 py-1.5 rounded-full bg-white text-black text-[10px] font-semibold uppercase tracking-[1.5px] font-[family-name:var(--font-space-grotesk)] hover:bg-zinc-200 transition',
    },
  ];

  return (
    <header className="border-b border-white/10 bg-zinc-950/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight text-xl hover:opacity-90 transition min-w-0"
        >
          {/* Fundo claro leve: logos pretas/circulares não “somem” no header escuro */}
          <span className="inline-flex items-center justify-center shrink-0 h-11 max-w-[min(220px,58vw)] rounded-xl bg-white/95 px-2 py-1 shadow-sm ring-1 ring-white/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={logoSrc}
              src={logoSrc}
              alt={siteName}
              className="h-9 w-auto max-w-full object-contain"
              onError={() => {
                setCandidateIndex((i) => {
                  if (i + 1 < candidates.length) return i + 1;
                  return i;
                });
              }}
            />
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-[13px] font-semibold uppercase tracking-[2.5px] font-[family-name:var(--font-space-grotesk)]">
          {links.map((l, i) => (
            <Link key={i} href={l.href} className={l.className || 'hover:text-white transition'}>
              {l.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 cursor-pointer"
          aria-label="Menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <nav className="md:hidden border-t border-white/10 bg-zinc-950 px-6 py-4 flex flex-col gap-4 text-[13px] font-semibold uppercase tracking-[2.5px] font-[family-name:var(--font-space-grotesk)]">
          {links.map((l, i) => (
            <Link
              key={i}
              href={l.href}
              className={l.className || 'hover:text-white transition'}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
