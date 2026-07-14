'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

type Stats = { total: number; checkedIn: number; notCheckedIn: number };

type Attendee = {
  ticketId: string;
  uniqueCode: string;
  status: string;
  checkedInAt?: string | null;
  ticketTypeName: string;
  buyerName: string;
  buyerEmail: string;
  accessCode?: string | null;
};

type EventInfo = {
  id: string;
  title: string;
  date: string;
  openTime?: string | null;
  address?: string | null;
};

function StatsBar({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-xl bg-zinc-900 border border-white/10 px-2 py-2.5 text-center">
        <div className="text-lg font-semibold tabular-nums text-white">{stats.total}</div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Ingressos</div>
      </div>
      <div className="rounded-xl bg-emerald-950/40 border border-emerald-500/25 px-2 py-2.5 text-center">
        <div className="text-lg font-semibold tabular-nums text-emerald-400">{stats.checkedIn}</div>
        <div className="text-[10px] text-emerald-500/80 uppercase tracking-wide">Check-in</div>
      </div>
      <div className="rounded-xl bg-amber-950/30 border border-amber-500/25 px-2 py-2.5 text-center">
        <div className="text-lg font-semibold tabular-nums text-amber-300">{stats.notCheckedIn}</div>
        <div className="text-[10px] text-amber-500/80 uppercase tracking-wide">Faltam</div>
      </div>
    </div>
  );
}

export default function CheckinEventoPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [stats, setStats] = useState<Stats>({ total: 0, checkedIn: 0, notCheckedIn: 0 });
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [filter, setFilter] = useState<'all' | 'valid' | 'used'>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('checkin-app');
    return () => document.body.classList.remove('checkin-app');
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (qDebounced) params.set('q', qDebounced);
      if (filter !== 'all') params.set('status', filter);
      const res = await fetch(
        `/api/checkin/events/${eventId}/attendees?${params}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      setEvent(data.event);
      setStats(data.stats || { total: 0, checkedIn: 0, notCheckedIn: 0 });
      setAttendees(data.attendees || []);
    } catch (e) {
      toast.error((e as Error).message || 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [eventId, qDebounced, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => attendees, [attendees]);

  async function doCheckin(a: Attendee) {
    if (a.status === 'used') return;
    if (!confirm(`Confirmar entrada de ${a.buyerName}?`)) return;
    setBusyId(a.ticketId);
    try {
      const res = await fetch('/api/checkin/validate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: a.ticketId, eventId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha');
      toast.success(`Check-in: ${a.buyerName}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function doUndo(a: Attendee) {
    if (a.status !== 'used') return;
    if (!confirm(`Desfazer entrada de ${a.buyerName}? O QR volta a valer.`)) return;
    setBusyId(a.ticketId);
    try {
      const res = await fetch('/api/checkin/undo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: a.ticketId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha');
      toast.success(`Check-in desfeito: ${a.buyerName}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="bg-zinc-900 border-b border-white/10 px-3 py-3 sticky top-0 z-20">
        <div className="flex items-center gap-2 max-w-lg mx-auto">
          <Link
            href="/checkin"
            className="text-zinc-400 hover:text-white text-sm px-2 py-1 shrink-0"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate text-sm sm:text-base">
              {event?.title || 'Evento'}
            </div>
            {event && (
              <div className="text-[10px] text-zinc-500 truncate">
                {new Date(event.date).toLocaleString('pt-BR', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {event.openTime ? ` · abre ${event.openTime}` : ''}
              </div>
            )}
          </div>
          <Link
            href={`/checkin?tab=scanner&eventId=${eventId}`}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
          >
            Scanner
          </Link>
        </div>
      </div>

      <div className="flex-1 p-4 max-w-lg mx-auto w-full pb-12 space-y-4">
        <StatsBar stats={stats} />

        <div className="space-y-2">
          <input
            className="input w-full text-sm"
            placeholder="Buscar nome, e-mail, CPF, código…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex gap-1.5">
            {(
              [
                { id: 'all' as const, label: 'Todos' },
                { id: 'valid' as const, label: 'Faltam' },
                { id: 'used' as const, label: 'Entraram' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`flex-1 text-xs py-2 rounded-lg border transition ${
                  filter === f.id
                    ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                    : 'border-white/10 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-zinc-500 text-sm py-12">Carregando…</div>
        ) : visible.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm py-12">
            Nenhum participante{qDebounced ? ' para esta busca' : ''}.
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((a) => {
              const used = a.status === 'used';
              return (
                <li
                  key={a.ticketId}
                  className={`rounded-2xl border p-3 ${
                    used
                      ? 'border-white/5 bg-zinc-900/40'
                      : 'border-white/10 bg-zinc-900/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">{a.buyerName || '—'}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{a.buyerEmail}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {a.ticketTypeName} ·{' '}
                        <span className="font-mono text-zinc-400">{a.uniqueCode}</span>
                      </div>
                      {used && a.checkedInAt && (
                        <div className="text-[10px] text-emerald-500/80 mt-1">
                          Entrou{' '}
                          {new Date(a.checkedInAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col gap-1.5">
                      {!used ? (
                        <button
                          type="button"
                          disabled={busyId === a.ticketId}
                          onClick={() => doCheckin(a)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50"
                        >
                          {busyId === a.ticketId ? '…' : 'Check-in'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === a.ticketId}
                          onClick={() => doUndo(a)}
                          className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-950/40 text-xs font-medium disabled:opacity-50"
                        >
                          {busyId === a.ticketId ? '…' : 'Desfazer'}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
