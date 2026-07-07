'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirect, setRedirect] = useState('/admin');
  const router = useRouter();

  useEffect(() => {
    // Safe client-side read of redirect param
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const r = params.get('redirect') || '/admin';
      setRedirect(r);
    }
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      // Read redirect reliably at login time
      const params = new URLSearchParams(window.location.search);
      const r = params.get('redirect') || '/admin';
      window.location.href = r;  // force full navigation to ensure cookie and remount
    } else {
      toast.error('Credenciais inválidas');
    }
    setLoading(false);
  }

  const isForCheckin = redirect === '/checkin' || redirect.startsWith('/checkin');

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <form onSubmit={login} className="card p-8 w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2 tracking-tight">Acesso Admin / Staff</h1>
        {isForCheckin && (
          <p className="text-sm text-emerald-400 mb-4">Login necessário para acessar o módulo de Check-in</p>
        )}
        <input
          type="email"
          className="input mb-3"
          placeholder="Email do admin"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="input mb-4"
          placeholder="Senha"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button disabled={loading} className="btn btn-primary w-full">Entrar</button>
        <p className="text-[10px] text-center mt-4 text-zinc-500">Use o email e senha configurados em ADMIN_EMAIL / ADMIN_PASSWORD no .env</p>
      </form>
    </div>
  );
}
