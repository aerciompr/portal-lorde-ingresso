'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [branding, setBranding] = useState<{ siteName?: string; logoUrl?: string }>({});

  useEffect(() => {
    fetch('/api/admin/settings', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then((s: any) => {
        setBranding({
          siteName: s.site_name || s.SITE_NAME || 'Lorde Nelson',
          logoUrl: s.logo_url || s.LOGO_URL || '',
        });
      })
      .catch(() => {});
  }, []);

  const siteName = branding.siteName || 'Lorde Nelson';
  const logoUrl = branding.logoUrl;

  const links = [
    { href: '/eventos', label: 'Programação' },
    { href: '/ingressos', label: 'Meus Ingressos' },
    { href: '/admin', label: 'ADMIN', className: 'px-4 py-1.5 rounded-full bg-white text-black text-[10px] font-semibold uppercase tracking-[1.5px] font-[family-name:var(--font-space-grotesk)] hover:bg-zinc-200 transition' },
  ];

  return (
    <header className="border-b border-white/10 bg-zinc-950/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-xl hover:opacity-90 transition">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={logoUrl} 
              alt={siteName} 
              className="h-10 w-auto max-w-[180px] object-contain" 
              onError={(e) => {
                // Fallback to text if image fails to load (404, invalid, etc)
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  parent.innerHTML = `<span class="inline-flex h-7 w-7 items-center justify-center rounded bg-emerald-600 text-white text-xs font-bold tracking-[1px]">LN</span> ${siteName}`;
                }
              }}
            />
          ) : (
            <>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-emerald-600 text-white text-xs font-bold tracking-[1px]">LN</span>
              {siteName}
            </>
          )}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-[13px] font-semibold uppercase tracking-[2.5px] font-[family-name:var(--font-space-grotesk)]">
          {links.map((l, i) => (
            <Link key={i} href={l.href} className={l.className || "hover:text-white transition"}>{l.label}</Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button onClick={() => setOpen(!open)} className="md:hidden p-2 cursor-pointer" aria-label="Menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="md:hidden border-t border-white/10 bg-zinc-950 px-6 py-4 flex flex-col gap-4 text-[13px] font-semibold uppercase tracking-[2.5px] font-[family-name:var(--font-space-grotesk)]">
          {links.map((l, i) => (
            <Link key={i} href={l.href} className={l.className || "hover:text-white transition"} onClick={() => setOpen(false)}>{l.label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}
