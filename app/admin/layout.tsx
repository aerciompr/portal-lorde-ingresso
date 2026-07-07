'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const getAdminUser = () => {
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|; )admin_user=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  };
  const [adminUser, setAdminUser] = useState<string>(getAdminUser());

  useEffect(() => {
    const user = getAdminUser();
    if (user) setAdminUser(user);
  }, []);

  const isLoginPage = pathname === '/admin/login' || pathname?.endsWith('/login');

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/eventos', label: 'Eventos', icon: '🎟️' },
    { href: '/admin/pedidos', label: 'Pedidos', icon: '📋' },
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
    <div className="min-h-screen bg-zinc-950 text-white flex">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-zinc-900 border-r border-white/10 transform transition-transform lg:translate-x-0 lg:static lg:inset-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-600 rounded flex items-center justify-center font-bold">LN</div>
            <div>
              <div className="font-semibold">Lorde Nelson</div>
              <div className="text-xs text-zinc-500">Portal Admin</div>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1 text-sm">
          {navItems.map(item => {
            const isActive = pathname === item.href || (item.href.includes('#') && pathname === '/admin');
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/5 transition cursor-pointer ${isActive ? 'bg-white/10 text-emerald-400' : 'text-zinc-400'}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full text-sm py-2 rounded-lg bg-zinc-800 hover:bg-red-900/40 text-red-400 flex items-center justify-center gap-2 cursor-pointer"
          >
            Sair
          </button>
          <div className="text-[10px] text-center text-zinc-500 mt-3">Versão interna • Lorde Nelson Pub</div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-white/10 bg-zinc-900/80 backdrop-blur flex items-center px-6 justify-between lg:justify-end">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)} 
            className="lg:hidden text-xl"
          >
            ☰
          </button>
          <div className="flex items-center gap-4 text-sm">
            {adminUser && (
              <span className="text-emerald-400 hidden sm:inline">Logado: {adminUser}</span>
            )}
            <button 
              onClick={handleLogout}
              className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-red-900/40 text-red-400"
            >
              Sair
            </button>
            <div className="text-sm text-zinc-400 hidden lg:block">
              Admin • Maceió
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
