'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';

type Stats = { total: number; checkedIn: number; notCheckedIn: number };

type EventRow = {
  id: string;
  title: string;
  date: string;
  openTime?: string | null;
  address?: string | null;
  stats: Stats;
};

type Tab = 'eventos' | 'scanner';

interface CheckinResult {
  eventTitle?: string;
  uniqueCode?: string;
  buyerName?: string;
  ticketTypeName?: string;
}

function StatsChips({ stats }: { stats: Stats }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 ring-1 ring-white/10">
        {stats.total} ingressos
      </span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
        {stats.checkedIn} check-in
      </span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25">
        {stats.notCheckedIn} faltam
      </span>
    </div>
  );
}

function formatEventWhen(date: string, openTime?: string | null) {
  const d = new Date(date);
  const day = d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  return `${day}${openTime ? ` · ${openTime}` : ''}`;
}

function CheckinInner() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'eventos';
  const lockEventId = searchParams.get('eventId') || '';

  const [tab, setTab] = useState<Tab>(initialTab === 'scanner' ? 'scanner' : 'eventos');
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [adminUser, setAdminUser] = useState('');
  const [today, setToday] = useState<EventRow[]>([]);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);
  const [past, setPast] = useState<EventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [lockEventTitle, setLockEventTitle] = useState('');
  const qrRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    document.body.classList.add('checkin-app');
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )admin_user=([^;]*)/);
      if (match) setAdminUser(decodeURIComponent(match[1]));
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-checkin.js').catch(() => undefined);
    }
    return () => document.body.classList.remove('checkin-app');
  }, []);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const [tRes, uRes, pRes] = await Promise.all([
        fetch('/api/checkin/events?scope=today', { credentials: 'include' }),
        fetch('/api/checkin/events?scope=upcoming', { credentials: 'include' }),
        fetch('/api/checkin/events?scope=past', { credentials: 'include' }),
      ]);
      if (tRes.ok) {
        const d = await tRes.json();
        setToday(d.events || []);
      }
      if (uRes.ok) {
        const d = await uRes.json();
        setUpcoming(d.events || []);
      }
      if (pRes.ok) {
        const d = await pRes.json();
        setPast(d.events || []);
      }
    } catch {
      toast.error('Falha ao carregar eventos');
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!lockEventId) return;
    fetch(`/api/checkin/events/${lockEventId}/attendees`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.event?.title) setLockEventTitle(d.event.title);
      })
      .catch(() => {});
  }, [lockEventId]);

  async function startScanner() {
    setScanning(true);
    const qrRegionId = 'qr-reader';
    try {
      const inst = new Html5Qrcode(qrRegionId);
      qrRef.current = inst;
      await inst.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        async (decodedText) => {
          await validateCode(decodedText);
          stopScanner();
        },
        () => {}
      );
    } catch {
      toast.error('Não foi possível iniciar a câmera');
      setScanning(false);
    }
  }

  function stopScanner() {
    const inst = qrRef.current;
    if (inst) {
      inst
        .stop()
        .then(() => {
          qrRef.current = null;
          setScanning(false);
        })
        .catch(() => setScanning(false));
    } else {
      setScanning(false);
    }
  }

  async function validateCode(qrOrCode: string) {
    try {
      const res = await fetch('/api/checkin/validate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: qrOrCode,
          ...(lockEventId ? { eventId: lockEventId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Inválido');
      setResult(data);
      toast.success('Check-in ok!');
      loadEvents();
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

  function EventList({ title, items }: { title: string; items: EventRow[] }) {
    if (items.length === 0) return null;
    return (
      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-2 px-0.5">{title}</h2>
        <div className="space-y-2">
          {items.map((ev) => (
            <Link
              key={ev.id}
              href={`/checkin/evento/${ev.id}`}
              className="block rounded-2xl border border-white/10 bg-zinc-900/80 hover:border-emerald-500/40 p-4 transition"
            >
              <div className="font-semibold text-white leading-snug">{ev.title}</div>
              <div className="text-xs text-zinc-500 mt-1">
                {formatEventWhen(ev.date, ev.openTime)}
              </div>
              <StatsChips stats={ev.stats} />
            </Link>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="bg-zinc-900 border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-sm font-bold shrink-0">
            LN
          </div>
          <div className="min-w-0">
            <div className="font-semibold">Check-in</div>
            <div className="text-[10px] text-emerald-400 -mt-0.5 truncate">
              Staff · Lorde Nelson
              {adminUser ? ` · ${adminUser}` : ''}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await fetch('/api/admin/logout', { method: 'POST' });
            window.location.href = '/admin/login?redirect=/checkin';
          }}
          className="px-3 py-1 rounded bg-zinc-800 hover:bg-red-900/40 text-red-400 text-xs"
        >
          Sair
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-zinc-950 sticky top-[57px] z-10">
        {(
          [
            { id: 'eventos' as Tab, label: 'Eventos' },
            { id: 'scanner' as Tab, label: 'Scanner' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === t.id
                ? 'text-emerald-400 border-b-2 border-emerald-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 max-w-lg mx-auto w-full pb-10">
        {tab === 'eventos' && (
          <>
            {loadingEvents ? (
              <div className="text-center text-zinc-500 text-sm py-16">Carregando eventos…</div>
            ) : (
              <>
                <EventList title="Hoje" items={today} />
                <EventList title="Próximos (todos)" items={upcoming} />
                <EventList title="Anteriores" items={past} />
                {today.length === 0 && upcoming.length === 0 && past.length === 0 && (
                  <div className="text-center text-zinc-500 text-sm py-16">
                    Nenhum evento cadastrado.
                  </div>
                )}
                <button
                  type="button"
                  onClick={loadEvents}
                  className="text-xs text-zinc-500 hover:text-zinc-300 w-full py-2"
                >
                  Atualizar lista
                </button>
              </>
            )}
          </>
        )}

        {tab === 'scanner' && (
          <>
            {lockEventId && (
              <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
                Scanner filtrado: <strong>{lockEventTitle || 'evento selecionado'}</strong>
                <Link href="/checkin?tab=scanner" className="ml-2 underline text-zinc-400">
                  limpar
                </Link>
              </div>
            )}

            <div className="card p-4 mb-4">
              <div
                id="qr-reader"
                className="w-full rounded-xl overflow-hidden bg-black mb-4"
                style={{ minHeight: scanning ? 320 : 80 }}
              />
              {!scanning ? (
                <button onClick={startScanner} className="btn btn-primary w-full">
                  Iniciar câmera (QR)
                </button>
              ) : (
                <button onClick={stopScanner} className="btn btn-secondary w-full">
                  Parar câmera
                </button>
              )}
            </div>

            <div className="flex gap-2 mb-4">
              <input
                className="input flex-1 font-mono text-sm"
                placeholder="Código do ingresso"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && manualCheck()}
              />
              <button onClick={manualCheck} className="btn btn-secondary shrink-0">
                Validar
              </button>
            </div>

            {result && (
              <div className="card p-5 bg-emerald-950/50 border border-emerald-900/50">
                <div className="text-emerald-400 text-xs uppercase tracking-wide">Validado</div>
                <div className="text-lg mt-1 font-semibold">{result.buyerName}</div>
                <div className="text-sm text-zinc-400 mt-1">{result.eventTitle}</div>
                {result.ticketTypeName && (
                  <div className="text-xs text-zinc-500 mt-0.5">{result.ticketTypeName}</div>
                )}
                <div className="mt-3 text-sm">
                  Código:{' '}
                  <span className="font-mono text-emerald-300">{result.uniqueCode}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Checkin() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-500 flex items-center justify-center text-sm">
          Carregando check-in…
        </div>
      }
    >
      <CheckinInner />
    </Suspense>
  );
}
