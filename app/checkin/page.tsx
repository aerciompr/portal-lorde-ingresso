'use client';

import { useState, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';

interface CheckinResult {
  eventTitle?: string;
  uniqueCode?: string;
  buyerName?: string;
}

export default function Checkin() {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const getAdminUser = () => {
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|; )admin_user=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  };

  // Initialize to empty to match SSR (prevents hydration mismatch on adminUser display)
  const [adminUser, setAdminUser] = useState<string>('');

  // Make it feel like a standalone mobile app: hide public header/footer + PWA SW
  useEffect(() => {
    document.body.classList.add('checkin-app');
    const user = getAdminUser();
    if (user) setAdminUser(user);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-checkin.js').catch(() => undefined);
    }
    return () => document.body.classList.remove('checkin-app');
  }, []);

  let html5QrCode: Html5Qrcode | null = null;

  async function startScanner() {
    setScanning(true);
    const qrRegionId = 'qr-reader';
    html5QrCode = new Html5Qrcode(qrRegionId);

    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        async (decodedText) => {
          await validateCode(decodedText);
          stopScanner();
        },
        () => {},
      );
    } catch {
      toast.error('Não foi possível iniciar a câmera');
      setScanning(false);
    }
  }

  function stopScanner() {
    if (html5QrCode) {
      html5QrCode.stop().then(() => setScanning(false)).catch(() => {});
    }
    setScanning(false);
  }

  async function validateCode(qrOrCode: string) {
    try {
      const res = await fetch('/api/checkin/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: qrOrCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      toast.success('Ingresso validado com sucesso!');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Ingresso inválido');
      setResult(null);
    }
  }

  async function manualCheck() {
    if (!code) return;
    await validateCode(code);
    setCode('');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Mobile App Header */}
      <div className="bg-zinc-900 border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-sm font-bold">LN</div>
          <div>
            <div className="font-semibold">Check-in</div>
            <div className="text-[10px] text-emerald-400 -mt-0.5">Staff App • Lorde Nelson</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {adminUser && (
            <span className="text-emerald-400 hidden sm:inline">Logado: {adminUser}</span>
          )}
          <button 
            onClick={async () => {
              await fetch('/api/admin/logout', { method: 'POST' });
              window.location.href = '/admin/login';
            }}
            className="px-3 py-1 rounded bg-zinc-800 hover:bg-red-900/40 text-red-400"
          >
            Sair
          </button>
          <div className="text-zinc-400">Somente funcionários</div>
        </div>
      </div>

      <div className="flex-1 p-4 max-w-md mx-auto w-full">
        <div className="card p-6 mb-6">
          <div id="qr-reader" className="w-full rounded-xl overflow-hidden bg-black mb-4" style={{ minHeight: scanning ? 320 : 80 }} />
          {!scanning ? (
            <button onClick={startScanner} className="btn btn-primary w-full">Iniciar Scanner de QR Code (câmera)</button>
          ) : (
            <button onClick={stopScanner} className="btn btn-secondary w-full">Parar câmera</button>
          )}
        </div>

        <div className="flex gap-3 mb-6">
          <input className="input flex-1 font-mono" placeholder="Código do ingresso (LN-XXXX)" value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && manualCheck()} />
          <button onClick={manualCheck} className="btn btn-secondary">Validar</button>
        </div>

        {result && (
          <div className="card p-6 bg-emerald-950 border-emerald-900">
            <div className="text-emerald-400 text-xs">VALIDADO</div>
            <div className="text-xl mt-1">{result.eventTitle}</div>
            <div className="mt-4 text-sm">Ingresso: <span className="font-mono">{result.uniqueCode}</span></div>
            <div>Nome: {result.buyerName}</div>
            <div className="text-xs mt-3 text-emerald-400">Check-in registrado em {new Date().toLocaleTimeString('pt-BR')}</div>
          </div>
        )}

        <div className="text-[10px] text-center text-zinc-500 mt-8">
          Módulo protegido. Acesso via login de funcionário (mesmo do Admin) ou API key (header X-API-Key ou ?key=...).
        </div>
      </div>
    </div>
  );
}
