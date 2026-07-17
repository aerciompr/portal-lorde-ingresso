'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { formatPrice, centsToInput, parseBRLToCents } from '@/lib/utils';

type Tab = 'cortesia' | 'manual' | 'limpeza';

interface EventOption {
  id: string;
  title: string;
  date: string;
  ticketTypes: { id: string; name: string; priceCents: number; totalQty: number; sold: number }[];
  activeLote?: { id: string; nome: string; precoCents: number } | null;
}

interface CleanupPreview {
  count: number;
  sample: { id: string; createdAt: string; event: string; tickets: number; totalCents: number; buyerEmail: string }[];
}

export default function AdminFerramentasPage() {
  const [tab, setTab] = useState<Tab>('cortesia');
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Shared form for cortesia / manual
  const [eventId, setEventId] = useState('');
  const [ticketTypeId, setTicketTypeId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [priceReais, setPriceReais] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    accessCode?: string;
    orderId?: string;
    tickets?: { uniqueCode: string; ticketType?: string }[];
    message?: string;
  } | null>(null);

  // Cleanup
  const [cleanupMinutes, setCleanupMinutes] = useState('30');
  const [cleanupEventId, setCleanupEventId] = useState('');
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch('/api/admin/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
        if (data[0] && !eventId) {
          setEventId(data[0].id);
        }
      }
    } catch {
      toast.error('Erro ao carregar eventos');
    } finally {
      setLoadingEvents(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === eventId) || null,
    [events, eventId]
  );

  useEffect(() => {
    if (!selectedEvent) {
      setTicketTypeId('');
      return;
    }
    const first = selectedEvent.ticketTypes[0];
    setTicketTypeId(first?.id || '');
    if (selectedEvent.activeLote) {
      setPriceReais(centsToInput(selectedEvent.activeLote.precoCents));
    } else if (first) {
      setPriceReais(centsToInput(first.priceCents));
    }
  }, [selectedEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTicket = selectedEvent?.ticketTypes.find((t) => t.id === ticketTypeId);
  const available = selectedTicket
    ? selectedTicket.totalQty - selectedTicket.sold
    : 0;

  async function submitOrder(kind: 'courtesy' | 'manual') {
    if (!eventId || !ticketTypeId) {
      toast.error('Selecione evento e tipo de ingresso');
      return;
    }
    const name = buyerName.trim() || (kind === 'courtesy' ? 'Cortesia' : '');
    const email = buyerEmail.trim();
    if (!name) {
      toast.error('Informe o nome');
      return;
    }
    if (!email.includes('@')) {
      toast.error('Informe um e-mail válido (para localizar o ingresso)');
      return;
    }

    setSubmitting(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/admin/orders/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          eventId,
          ticketTypeId,
          quantity: parseInt(quantity, 10) || 1,
          buyerName: name,
          buyerEmail: email,
          buyerPhone,
          priceReais: kind === 'manual' ? priceReais : undefined,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha');
      toast.success(data.message || 'Pedido criado');
      setLastResult({
        accessCode: data.accessCode,
        orderId: data.orderId,
        tickets: data.tickets,
        message: data.message,
      });
      loadEvents();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Erro');
    } finally {
      setSubmitting(false);
    }
  }

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      const params = new URLSearchParams({
        minutes: String(parseInt(cleanupMinutes, 10) || 30),
      });
      if (cleanupEventId) params.set('eventId', cleanupEventId);
      const res = await fetch(`/api/admin/orders/cleanup-pending?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      setPreview(data);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Erro na prévia');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function runCleanup() {
    const mins = Math.max(0, parseInt(cleanupMinutes, 10) || 0);
    if (
      !confirm(
        (mins <= 0
          ? 'Cancelar TODOS os pedidos pending (qualquer idade)'
          : `Cancelar pending com mais de ${mins} minutos`) +
          (cleanupEventId ? ' neste evento' : ' (todos os eventos)') +
          ' e devolver estoque?\n\nTambém repara cancelados que ainda prendem estoque.'
      )
    ) {
      return;
    }
    setCleaning(true);
    try {
      const res = await fetch('/api/admin/orders/cleanup-pending', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minutes: mins,
          eventId: cleanupEventId || null,
          repairCancelled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      toast.success(data.message);
      setPreview(null);
      loadPreview();
      loadEvents();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Erro na limpeza');
    } finally {
      setCleaning(false);
    }
  }

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: 'cortesia', label: 'Cortesias', desc: 'Gerar ingressos grátis' },
    { id: 'manual', label: 'Pedido manual', desc: 'Criar pedido já pago' },
    { id: 'limpeza', label: 'Limpar pendentes', desc: 'Devolver estoque' },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Ferramentas</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Cortesias, pedidos manuais e limpeza de pendentes com devolução ao estoque.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setLastResult(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-sm border transition text-left ${
              tab === t.id
                ? 'border-emerald-500/60 bg-emerald-950/40 text-white'
                : 'border-white/10 text-zinc-400 hover:bg-white/5'
            }`}
          >
            <div className="font-medium">{t.label}</div>
            <div className="text-[10px] text-zinc-500">{t.desc}</div>
          </button>
        ))}
      </div>

      {loadingEvents && (
        <div className="text-sm text-zinc-500 mb-4">Carregando eventos...</div>
      )}

      {/* CORTESIA + MANUAL share most of the form */}
      {(tab === 'cortesia' || tab === 'manual') && (
        <div className="card p-6 space-y-4">
          <div>
            <div className="label mb-1">Evento</div>
            <select
              className="input"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} —{' '}
                  {new Date(ev.date).toLocaleDateString('pt-BR', {
                    timeZone: 'America/Maceio',
                  })}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="label mb-1">Tipo de ingresso</div>
              <select
                className="input"
                value={ticketTypeId}
                onChange={(e) => setTicketTypeId(e.target.value)}
                disabled={!selectedEvent}
              >
                {(selectedEvent?.ticketTypes || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.totalQty - t.sold} disp.)
                  </option>
                ))}
              </select>
              {selectedTicket && (
                <div className="text-[10px] text-zinc-500 mt-1">
                  Disponível: {available}
                  {selectedEvent?.activeLote && (
                    <> · Lote ativo: {selectedEvent.activeLote.nome} ({formatPrice(selectedEvent.activeLote.precoCents)})</>
                  )}
                </div>
              )}
            </div>
            <div>
              <div className="label mb-1">Quantidade</div>
              <input
                className="input"
                type="number"
                min={1}
                max={Math.max(1, available)}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="label mb-1">Nome {tab === 'cortesia' ? '(ou “Cortesia”)' : '*'}</div>
              <input
                className="input"
                placeholder={tab === 'cortesia' ? 'Cortesia / Nome do convidado' : 'Nome completo'}
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
            </div>
            <div>
              <div className="label mb-1">E-mail *</div>
              <input
                className="input"
                type="email"
                placeholder="email@exemplo.com"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="label mb-1">Telefone (opcional)</div>
            <input
              className="input"
              placeholder="(82) 99999-9999"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
            />
          </div>

          {tab === 'manual' && (
            <>
              <div>
                <div className="label mb-1">Preço unitário (R$)</div>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="35,00"
                  value={priceReais}
                  onChange={(e) => setPriceReais(e.target.value)}
                />
                <div className="text-[10px] text-zinc-500 mt-1">
                  Total: {formatPrice(parseBRLToCents(priceReais) * (parseInt(quantity, 10) || 1))}
                </div>
              </div>
              <div>
                <div className="label mb-1">Observação (opcional)</div>
                <input
                  className="input"
                  placeholder="Ex: pago em dinheiro no balcão"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </>
          )}

          {tab === 'cortesia' && (
            <p className="text-xs text-zinc-500">
              A cortesia é registrada como pedido <strong className="text-zinc-400">pago R$ 0,00</strong> com
              QR Codes válidos. O estoque é debitado normalmente.
            </p>
          )}

          <button
            type="button"
            disabled={submitting || !eventId || available < 1}
            onClick={() => submitOrder(tab === 'cortesia' ? 'courtesy' : 'manual')}
            className="btn btn-primary w-full py-3 disabled:opacity-50"
          >
            {submitting
              ? 'Processando...'
              : tab === 'cortesia'
                ? 'Gerar cortesia'
                : 'Criar pedido manual (pago)'}
          </button>

          {lastResult && (
            <div className="mt-2 p-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 text-sm space-y-2">
              <div className="text-emerald-400 font-medium">{lastResult.message}</div>
              {lastResult.accessCode && (
                <div>
                  Código de acesso:{' '}
                  <code className="font-mono text-emerald-300 tracking-widest">{lastResult.accessCode}</code>
                </div>
              )}
              <div className="text-xs text-zinc-500">
                O convidado pode acessar em /ingressos com e-mail + código.
              </div>
              {lastResult.tickets && lastResult.tickets.length > 0 && (
                <ul className="text-xs text-zinc-400 space-y-1 max-h-32 overflow-auto">
                  {lastResult.tickets.map((t) => (
                    <li key={t.uniqueCode}>
                      {t.ticketType || 'Ingresso'}: <code className="text-zinc-300">{t.uniqueCode}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* LIMPEZA */}
      {tab === 'limpeza' && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-zinc-400">
            Pedidos com status <strong className="text-zinc-300">pending</strong> (não pagos) reservam estoque.
            Esta ferramenta cancela os abandonados após X minutos e devolve os ingressos.
          </p>
          <div className="text-xs text-zinc-500 p-3 rounded-xl border border-white/10 bg-zinc-950/50 space-y-1">
            <div className="text-zinc-400 font-medium">Limpeza automática (cron)</div>
            <div>
              Em produção (Vercel) roda a cada 15 min em <code className="text-zinc-400">/api/cron/cleanup-pending</code>.
              Configure <code className="text-zinc-400">CRON_SECRET</code> no ambiente e o TTL em Configurações → Regras.
            </div>
            <div>
              Local / externo: chame a URL com o secret, ex:{' '}
              <code className="text-zinc-400 break-all">GET /api/cron/cleanup-pending?secret=SEU_CRON_SECRET</code>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="label mb-1">Tempo mínimo (minutos)</div>
              <input
                className="input"
                type="number"
                min={0}
                value={cleanupMinutes}
                onChange={(e) => setCleanupMinutes(e.target.value)}
              />
              <div className="text-[10px] text-zinc-500 mt-1">
                0 = todos os pending. Sugestão: 15–30. Também repara estoque preso em cancelados.
              </div>
            </div>
            <div>
              <div className="label mb-1">Evento (opcional)</div>
              <select
                className="input"
                value={cleanupEventId}
                onChange={(e) => setCleanupEventId(e.target.value)}
              >
                <option value="">Todos os eventos</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadPreview}
              disabled={loadingPreview}
              className="btn btn-secondary"
            >
              {loadingPreview ? 'Carregando...' : 'Pré-visualizar'}
            </button>
            <button
              type="button"
              onClick={runCleanup}
              disabled={cleaning}
              className="btn bg-red-900/50 hover:bg-red-800/60 text-red-200 border border-red-900/50"
            >
              {cleaning ? 'Limpando...' : 'Limpar e devolver estoque'}
            </button>
          </div>

          {preview && (
            <div className="mt-2 p-4 rounded-xl border border-white/10 bg-zinc-950/60 text-sm">
              <div className="font-medium mb-2">
                {preview.count === 0
                  ? 'Nenhum pedido pendente no critério.'
                  : `${preview.count} pedido(s) seriam cancelados:`}
              </div>
              {preview.sample.length > 0 && (
                <ul className="space-y-2 text-xs text-zinc-400 max-h-48 overflow-auto">
                  {preview.sample.map((o) => (
                    <li key={o.id} className="flex justify-between gap-2 border-b border-white/5 pb-1">
                      <span>
                        {o.event} · {o.tickets} ing. · {o.buyerEmail}
                      </span>
                      <span className="text-zinc-600 shrink-0">
                        {new Date(o.createdAt).toLocaleString('pt-BR', {
                          timeZone: 'America/Maceio',
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {preview.count > 20 && (
                <div className="text-[10px] text-zinc-600 mt-2">Mostrando 20 de {preview.count}.</div>
              )}
            </div>
          )}

          <p className="text-[10px] text-zinc-600">
            Não altera pedidos pagos. Pedidos limpos ficam com status &quot;cancelled&quot;.
          </p>
        </div>
      )}
    </div>
  );
}
