'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export default function Header({
  initialBranding = {},
}: {
  initialBranding?: { siteName?: string; logoUrl?: string };
}) {
  const [open, setOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const siteName = initialBranding.siteName || 'Lorde Nelson';
  // Só a logo enviada no admin — sem imagem padrão / sem “LN” junto com a logo
  const logoUrl = (initialBranding.logoUrl || '').trim();
  const showLogo = Boolean(logoUrl) && !logoFailed;

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
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={siteName}
              className="h-10 w-auto max-w-[min(200px,55vw)] object-contain"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span className="truncate text-white">{siteName}</span>
          )}
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
