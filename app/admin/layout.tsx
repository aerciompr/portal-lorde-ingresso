'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState('/logo-lordenelson.jpg');
  const [siteName, setSiteName] = useState('Lorde Nelson');
  const [logoFailed, setLogoFailed] = useState(false);

  const getAdminUser = () => {
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|; )admin_user=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  };

  const [adminUser, setAdminUser] = useState<string>('');

  useEffect(() => {
    const user = getAdminUser();
    if (user) setAdminUser(user);
  }, []);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        const next = (data.logo_url || data.favicon_url || '/logo-lordenelson.jpg')
          .toString()
          .trim();
        setLogoUrl(next);
        setLogoFailed(false);
        if (data.site_name) setSiteName(String(data.site_name));
      })
      .catch(() => {
        setLogoUrl('/logo-lordenelson.jpg');
        setLogoFailed(false);
      });
  }, [pathname]);

  const isLoginPage = pathname === '/admin/login' || pathname?.endsWith('/login');

  // Um único scroll: trava html/body; só .admin-main rola (evita scroll-dentro-de-scroll)
  useEffect(() => {
    if (typeof document === 'undefined' || isLoginPage) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.classList.add('admin-locked');
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      html.classList.remove('admin-locked');
    };
  }, [isLoginPage]);

  // Fecha menu ao mudar de rota
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/eventos', label: 'Eventos', icon: '🎟️' },
    { href: '/admin/cupons', label: 'Cupons', icon: '🏷️' },
    { href: '/admin/pedidos', label: 'Pedidos', icon: '📋' },
    { href: '/admin/clientes', label: 'Clientes', icon: '👥' },
    { href: '/admin/cancelamentos', label: 'Cancelamentos', icon: '↩️' },
    { href: '/admin/importacao', label: 'Importação CSV', icon: '📥' },
    { href: '/admin/email-migracao', label: 'E-mail migração', icon: '✉️' },
    { href: '/admin/usuarios', label: 'Usuários', icon: '👤' },
    { href: '/admin/ferramentas', label: 'Ferramentas', icon: '🛠️' },
    { href: '/admin/ingresso-preview', label: 'Layout ingresso', icon: '🎫' },
    { href: '/admin/reports', label: 'Relatórios', icon: '📈' },
    { href: '/admin/configuracoes', label: 'Configurações', icon: '⚙️' },
    { href: '/checkin', label: 'Check-in (App Mobile Staff)', icon: '📱', external: true },
  ];

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="admin-shell fixed inset-0 z-20 h-[100dvh] max-h-[100dvh] bg-zinc-950 text-white flex overflow-hidden">
      {/* Overlay mobile — fecha o menu ao tocar */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: coluna flex com nav rolável */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(18rem,88vw)] max-w-xs bg-zinc-900 border-r border-white/10 flex flex-col
          transform transition-transform duration-200 ease-out
          lg:static lg:translate-x-0 lg:z-auto lg:w-64 lg:max-w-none lg:shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-4 sm:p-5 border-b border-white/10 shrink-0 flex items-center justify-between gap-2">
          <Link
            href="/admin"
            className="flex items-center gap-2 min-w-0"
            onClick={() => setSidebarOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoFailed ? '/logo-lordenelson.jpg' : logoUrl}
              alt={siteName}
              className="h-9 w-auto max-w-[120px] object-contain bg-transparent shrink-0"
              onError={() => setLogoFailed(true)}
            />
          </Link>
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white text-lg leading-none"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            ✕
          </button>
        </div>
        <div className="px-4 pt-1 pb-0 shrink-0">
          <div className="text-[10px] text-zinc-500">Portal Admin</div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-0.5 text-sm [-webkit-overflow-scrolling:touch]">
          {navItems.map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname === item.href ||
                  (item.href !== '/checkin' &&
                    Boolean(pathname?.startsWith(item.href + '/')));
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition cursor-pointer ${
                  isActive ? 'bg-white/10 text-emerald-400' : 'text-zinc-400'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="leading-snug">{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="shrink-0 p-3 border-t border-white/10 safe-bottom">
          <button
            onClick={handleLogout}
            className="w-full text-sm py-2.5 rounded-lg bg-zinc-800 hover:bg-red-900/40 text-red-400 flex items-center justify-center gap-2 cursor-pointer"
            type="button"
          >
            Sair
          </button>
          <div className="text-[10px] text-center text-zinc-500 mt-2">
            Versão interna • Lorde Nelson Pub
          </div>
        </div>
      </aside>

      {/* Coluna principal: header fixo + conteúdo rolável */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
        <header className="h-14 shrink-0 border-b border-white/10 bg-zinc-900/95 backdrop-blur flex items-center px-3 sm:px-4 justify-between gap-2 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-xl p-2 -ml-1 rounded-lg hover:bg-white/10"
            type="button"
            aria-label="Abrir menu"
          >
            ☰
          </button>
          <div className="text-sm font-medium text-zinc-300 lg:hidden truncate">
            Admin
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm ml-auto">
            {adminUser && (
              <span className="text-emerald-400 hidden sm:inline text-xs truncate max-w-[140px]">
                {adminUser}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-900/40 text-red-400"
              type="button"
            >
              Sair
            </button>
            <div className="text-xs text-zinc-500 hidden lg:block">Maceió</div>
          </div>
        </header>

        <main className="admin-main flex-1 min-h-0 overflow-y-auto overflow-x-auto overscroll-contain p-3 sm:p-5 lg:p-8 [-webkit-overflow-scrolling:touch]">
          <div className="admin-main-inner min-w-0 w-full max-w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
