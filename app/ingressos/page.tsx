'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  formatPrice,
  formatDate,
  orderStatusLabel,
  ticketStatusLabel,
  cancellationStatusLabel,
} from '@/lib/utils';
import { toast } from 'sonner';
import QRCode from 'react-qr-code';
import { formatCpf, cleanDigits } from '@/lib/masks';
import {
  Mail,
  KeyRound,
  Lock,
  LogOut,
  Download,
  QrCode,
  Calendar,
  MapPin,
  Ticket,
  Clock,
  History,
  LayoutGrid,
  X,
  Menu,
  User,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Undo2,
} from 'lucide-react';

interface TicketItem {
  id: string;
  uniqueCode: string;
  status: string;
  ticketType: { name: string; priceCents: number };
}

interface Order {
  id: string;
  totalCents: number;
  status: string;
  buyerName: string;
  buyerEmail: string;
  buyerPasswordHash?: string | null;
  event: { id: string; title: string; date: string | Date; address: string };
  tickets: TicketItem[];
  cancellationRequests: { id: string; status: string; reason: string }[];
}

type LoginTab = 'codigo' | 'senha';
type NavId = 'proximos' | 'passados' | 'estornos' | 'todos' | 'conta';

function eventDate(d: string | Date) {
  return new Date(d);
}

function isUpcoming(d: string | Date) {
  const limit = new Date(d);
  limit.setHours(23, 59, 59, 999);
  return limit.getTime() >= Date.now();
}

function isRefunded(o: { status: string }) {
  return (o.status || '').toLowerCase() === 'refunded';
}

/** Evento ainda por vir e pedido válido (não estornado / cancelado) */
function isActiveUpcoming(o: Order) {
  const s = (o.status || '').toLowerCase();
  if (s === 'refunded' || s === 'cancelled' || s === 'canceled') return false;
  return isUpcoming(o.event.date);
}

function statusBadge(status: string) {
  const text = orderStatusLabel(status);
  const s = (status || '').toLowerCase();
  if (s === 'paid') return { text, cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' };
  if (s === 'refunded') return { text, cls: 'bg-red-500/15 text-red-400 ring-red-500/20' };
  if (s === 'cancelled' || s === 'canceled')
    return { text, cls: 'bg-zinc-500/20 text-zinc-400 ring-zinc-500/20' };
  return { text, cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/20' };
}

export default function MeusIngressos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [previewTicket, setPreviewTicket] = useState<{
    code: string;
    payload: string;
    name: string;
    event: string;
    date: string;
  } | null>(null);

  const [email, setEmail] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('email')) return q.get('email') || '';
      const saved = localStorage.getItem('clientSession');
      if (saved) return JSON.parse(saved).email || '';
    } catch {}
    return '';
  });
  const [code, setCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('code')) return (q.get('code') || '').toUpperCase();
      const saved = localStorage.getItem('clientSession');
      if (saved) return JSON.parse(saved).code || '';
    } catch {}
    return '';
  });
  const [password, setPassword] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('success') === '1' || q.get('code')) return '';
      const saved = localStorage.getItem('clientSession');
      if (saved) return JSON.parse(saved).password || '';
    } catch {}
    return '';
  });
  const [newPassword, setNewPassword] = useState('');
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [justPaid, setJustPaid] = useState(false);
  const [loginTab, setLoginTab] = useState<LoginTab>(() => {
    if (typeof window === 'undefined') return 'codigo';
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('code') || q.get('success') === '1') return 'codigo';
    } catch {}
    return 'codigo';
  });
  const [nav, setNav] = useState<NavId>('proximos');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [showResend, setShowResend] = useState(false);

  const loggedIn = orders.length > 0;

  function applyOrders(list: Order[], e: string, c: string, p?: string) {
    setOrders(list);
    setSearched(true);
    if (list.length === 0) {
      toast.info('Nenhum ingresso encontrado. Confira o código ou a senha.');
      return;
    }
    localStorage.setItem(
      'clientSession',
      JSON.stringify({ email: e || list[0]?.buyerEmail || '', code: c || '', password: p || '' })
    );
    if (e || list[0]?.buyerEmail) setEmail(e || list[0].buyerEmail);
    const hasHash = list.some((o) => !!(o as Order).buyerPasswordHash);
    setShowSetPassword(!hasHash);
    setNav(list.some((o) => isActiveUpcoming(o)) ? 'proximos' : list.some(isRefunded) ? 'estornos' : 'passados');
    setSidebarOpen(false);
  }

  function lookupWith(e: string, c: string, p?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    const cleaned = cleanDigits(e);
    if (cleaned.length === 11) params.set('cpf', cleaned);
    else if (e) params.set('email', e);
    if (c) params.set('code', c);
    if (p) params.set('password', p);
    fetch(`/api/orders/lookup?${params}`)
      .then((r) => r.json())
      .then((data) => applyOrders(data.orders || [], e, c, p))
      .catch(() => toast.error('Erro ao buscar ingressos'))
      .finally(() => setLoading(false));
  }

  const didAutoLookup = useRef(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('success') === '1') {
        setJustPaid(true);
        toast.success('Pagamento confirmado!');
      }
    }
    if (didAutoLookup.current) return;
    if (email && (code || password)) {
      didAutoLookup.current = true;
      lookupWith(email, code, password);
    } else if (code) {
      didAutoLookup.current = true;
      lookupWith(email, code);
    }
  }, [email, code, password]);

  async function lookup(usePassword = false) {
    if (usePassword) {
      if (!email || !password) {
        toast.error('Informe e-mail/CPF e senha');
        return;
      }
    } else if (!code) {
      toast.error('Informe o código LN-… da compra');
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    const cleaned = cleanDigits(email);
    if (cleaned.length === 11) params.set('cpf', cleaned);
    else if (email) params.set('email', email);
    if (!usePassword && code) params.set('code', code);
    if (usePassword && password) params.set('password', password);
    try {
      const res = await fetch(`/api/orders/lookup?${params}`);
      const data = await res.json();
      applyOrders(data.orders || [], email, usePassword ? '' : code, usePassword ? password : '');
      if ((data.orders || []).length > 0) toast.success('Ingressos carregados');
    } catch {
      toast.error('Erro ao buscar');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('clientSession');
    setOrders([]);
    setSearched(false);
    setPassword('');
    setShowSetPassword(false);
    setJustPaid(false);
    setNav('proximos');
  }

  async function downloadPDF(ticketId: string) {
    window.open(`/api/tickets/${ticketId}/pdf`, '_blank');
  }

  async function requestCancel(order: Order) {
    const reason = prompt('Motivo do cancelamento (obrigatório):');
    if (!reason) return;
    const res = await fetch('/api/cancellations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id, reason }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || 'Não foi possível solicitar');
    else {
      toast.success('Solicitação enviada!');
      lookupWith(email, code, password);
    }
  }

  const canCancel = (order: Order) => {
    if (order.status !== 'paid') return false;
    if (order.cancellationRequests.some((cr) => cr.status === 'pending' || cr.status === 'approved'))
      return false;
    return isUpcoming(order.event.date);
  };

  const { upcoming, past, refunded, counts } = useMemo(() => {
    const up: Order[] = [];
    const pa: Order[] = [];
    const ref: Order[] = [];
    for (const o of orders) {
      if (isRefunded(o)) {
        ref.push(o);
        continue;
      }
      // Estornado nunca entra em “próximos”, mesmo com data futura
      if (isActiveUpcoming(o)) up.push(o);
      else pa.push(o);
    }
    up.sort((a, b) => eventDate(a.event.date).getTime() - eventDate(b.event.date).getTime());
    pa.sort((a, b) => eventDate(b.event.date).getTime() - eventDate(a.event.date).getTime());
    ref.sort((a, b) => eventDate(b.event.date).getTime() - eventDate(a.event.date).getTime());
    return {
      upcoming: up,
      past: pa,
      refunded: ref,
      counts: {
        proximos: up.length,
        passados: pa.length,
        estornos: ref.length,
        todos: orders.length,
        tickets: orders.reduce((s, o) => s + o.tickets.length, 0),
      },
    };
  }, [orders]);

  const visibleOrders =
    nav === 'proximos'
      ? upcoming
      : nav === 'passados'
        ? past
        : nav === 'estornos'
          ? refunded
          : nav === 'todos'
            ? [...upcoming, ...past, ...refunded]
            : [];

  function onEmailChange(val: string) {
    const digits = cleanDigits(val);
    if (digits.length > 0 && digits.length <= 11 && /^[0-9.\- ]*$/.test(val)) {
      setEmail(formatCpf(val));
    } else setEmail(val);
  }

  const displayName = email || orders[0]?.buyerEmail || 'Cliente';
  const navItems: { id: NavId; label: string; icon: typeof Clock; n?: number; desc: string }[] = [
    { id: 'proximos', label: 'Próximos', icon: Sparkles, n: counts.proximos, desc: 'Ainda por vir' },
    { id: 'passados', label: 'Passados', icon: History, n: counts.passados, desc: 'Já realizados' },
    { id: 'estornos', label: 'Estornos', icon: Undo2, n: counts.estornos, desc: 'Reembolsados' },
    { id: 'todos', label: 'Todos', icon: LayoutGrid, n: counts.todos, desc: 'Lista completa' },
    { id: 'conta', label: 'Conta', icon: User, desc: 'Senha e sessão' },
  ];

  // ─── LOGIN ─────────────────────────────────────────────
  if (!loggedIn) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col">
        <div className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
          <div className="relative max-w-lg mx-auto px-4 pt-10 pb-16 sm:pt-14 sm:pb-20 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/30 mb-4">
              <Ticket className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              Meus Ingressos
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-sm mx-auto">
              Sem conta obrigatória. Entre com o código da compra ou com a senha, se já tiver criado.
            </p>
          </div>
        </div>

        <div className="flex-1 max-w-md w-full mx-auto px-4 -mt-8 sm:-mt-10 relative z-10 pb-12">
          <div className="rounded-3xl border border-white/10 bg-zinc-900/95 shadow-2xl shadow-black/40 backdrop-blur overflow-hidden">
            {justPaid && (
              <div className="px-5 py-3.5 bg-emerald-500/10 border-b border-emerald-500/20 text-left">
                <p className="text-sm font-medium text-emerald-300">Pagamento confirmado</p>
                <p className="text-xs text-emerald-200/70 mt-0.5">
                  {code
                    ? `Código ${code} pronto — toque em Ver ingressos.`
                    : 'Use o código LN-… da tela do PIX.'}
                </p>
              </div>
            )}

            <div className="p-1.5 m-3 flex rounded-2xl bg-zinc-950 border border-white/8">
              <button
                type="button"
                onClick={() => setLoginTab('codigo')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition ${
                  loginTab === 'codigo'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <KeyRound size={16} /> Código
              </button>
              <button
                type="button"
                onClick={() => setLoginTab('senha')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition ${
                  loginTab === 'senha'
                    ? 'bg-white text-black shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Mail size={16} /> Senha
              </button>
            </div>

            <div className="px-5 pb-5 space-y-3">
              {loginTab === 'codigo' ? (
                <>
                  <input
                    type="text"
                    className="input"
                    placeholder="E-mail da compra (opcional)"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    autoComplete="email"
                  />
                  <input
                    className="input font-mono tracking-[0.2em] text-center text-lg uppercase"
                    placeholder="LN-XXXXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && lookup(false)}
                    maxLength={12}
                  />
                  <button
                    type="button"
                    onClick={() => lookup(false)}
                    disabled={loading || !code}
                    className="btn btn-primary w-full py-3.5 text-base"
                  >
                    {loading ? 'Buscando…' : 'Ver meus ingressos'}
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    className="input"
                    placeholder="E-mail ou CPF"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                  />
                  <input
                    type="password"
                    className="input"
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && lookup(true)}
                  />
                  <button
                    type="button"
                    onClick={() => lookup(true)}
                    disabled={loading || !email || !password}
                    className="btn btn-primary w-full py-3.5 text-base"
                  >
                    {loading ? 'Entrando…' : 'Entrar com senha'}
                  </button>
                </>
              )}

              <div className="pt-3 border-t border-white/8">
                <button
                  type="button"
                  onClick={() => {
                    setShowResend((v) => !v);
                    if (!resendEmail && email) setResendEmail(email);
                  }}
                  className="flex items-center justify-center gap-1.5 text-xs text-emerald-400/90 hover:text-emerald-300 w-full py-2"
                >
                  <RefreshCw size={12} />
                  {showResend ? 'Fechar' : 'Reenviar código por e-mail'}
                </button>
                {showResend && (
                  <div className="space-y-2 mt-2">
                    <input
                      type="text"
                      className="input text-sm"
                      placeholder="E-mail ou CPF da compra"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={resending || !resendEmail.trim()}
                      className="btn btn-secondary w-full py-2.5 text-sm"
                      onClick={async () => {
                        setResending(true);
                        try {
                          const raw = resendEmail.trim();
                          const dig = cleanDigits(raw);
                          const body =
                            dig.length === 11 && /^[\d.\-\s]+$/.test(raw)
                              ? { cpf: dig }
                              : { email: raw.toLowerCase() };
                          const res = await fetch('/api/orders/resend-code', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || 'Falha no envio');
                          toast.success(data.message || 'E-mail enviado se houver pedidos.');
                          setShowResend(false);
                        } catch (err: unknown) {
                          toast.error((err as Error).message || 'Erro ao reenviar');
                        } finally {
                          setResending(false);
                        }
                      }}
                    >
                      {resending ? 'Enviando…' : 'Enviar códigos'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {searched && !loggedIn && (
            <p className="text-center text-sm text-zinc-500 mt-6">Nenhum ingresso com esses dados.</p>
          )}

          <p className="text-center text-[11px] text-zinc-600 mt-8">
            <Link href="/eventos" className="text-zinc-400 hover:text-white underline-offset-2 hover:underline">
              ← Voltar à programação
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ─── APP SHELL (logado) ────────────────────────────────
  function renderOrderCard(order: Order) {
    const st = statusBadge(order.status);
    const up = isUpcoming(order.event.date);
    return (
      <article
        key={order.id}
        className={`rounded-2xl sm:rounded-3xl border bg-zinc-900/80 overflow-hidden transition ${
          up && order.status === 'paid'
            ? 'border-emerald-500/25 shadow-lg shadow-emerald-950/20'
            : 'border-white/10'
        }`}
      >
        <div className="p-4 sm:p-5 flex gap-3 sm:gap-4">
          <div
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 ${
              up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            <Calendar size={18} className="mb-0.5" />
            <span className="text-[9px] font-semibold uppercase tracking-wide">
              {up ? 'Live' : 'Fim'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-base sm:text-lg text-white tracking-tight leading-snug">
                {order.event.title}
              </h2>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md ring-1 ${st.cls}`}
              >
                {st.text}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> {formatDate(order.event.date)}
              </span>
              <span className="text-zinc-600">·</span>
              <span>
                {order.tickets.length} ingresso{order.tickets.length !== 1 ? 's' : ''}
              </span>
              <span className="text-zinc-600">·</span>
              <span className="tabular-nums">{formatPrice(order.totalCents)}</span>
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 flex items-start gap-1 line-clamp-1">
              <MapPin size={11} className="mt-0.5 shrink-0" />
              {order.event.address}
            </p>
          </div>
        </div>

        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-2.5 border-t border-white/5 pt-3">
          {order.tickets.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl bg-zinc-950/90 border border-white/8 p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-100">{t.ticketType.name}</div>
                <div className="font-mono text-emerald-400 text-sm tracking-wider mt-0.5">
                  {t.uniqueCode}
                </div>
                {t.status !== 'valid' && (
                  <div className="text-[10px] text-zinc-500 mt-1">{ticketStatusLabel(t.status)}</div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => downloadPDF(t.id)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 py-2.5 text-xs font-medium hover:bg-white/5 transition"
                >
                  <Download size={14} /> PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewTicket({
                      code: t.uniqueCode,
                      payload: t.uniqueCode,
                      name: order.buyerName,
                      event: order.event.title,
                      date: formatDate(order.event.date),
                    })
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2.5 text-xs font-medium text-white transition"
                >
                  <QrCode size={14} /> QR Code
                </button>
              </div>
            </div>
          ))}

          {order.status === 'paid' && canCancel(order) && (
            <button
              type="button"
              onClick={() => requestCancel(order)}
              className="text-[11px] text-red-400/80 hover:text-red-300"
            >
              Solicitar cancelamento
            </button>
          )}
          {order.cancellationRequests.length > 0 && (
            <div className="text-[11px] rounded-xl px-3 py-2 bg-amber-950/40 text-amber-200/90 border border-amber-500/15">
              Cancelamento:{' '}
              <strong>{cancellationStatusLabel(order.cancellationRequests[0].status)}</strong>
              {order.cancellationRequests[0].reason
                ? ` — ${order.cancellationRequests[0].reason}`
                : ''}
            </div>
          )}
        </div>
      </article>
    );
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-emerald-700/20 ring-1 ring-emerald-500/30 flex items-center justify-center">
            <Ticket className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Área do cliente</div>
            <div className="font-semibold text-white truncate text-sm">{displayName}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-zinc-950/80 border border-white/8 px-3 py-2.5 text-center">
            <div className="text-lg font-semibold text-white tabular-nums">{counts.tickets}</div>
            <div className="text-[10px] text-zinc-500">Ingressos</div>
          </div>
          <div className="rounded-xl bg-zinc-950/80 border border-white/8 px-3 py-2.5 text-center">
            <div className="text-lg font-semibold text-emerald-400 tabular-nums">{counts.proximos}</div>
            <div className="text-[10px] text-zinc-500">Próximos</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = nav === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setNav(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition ${
                active
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={18} className="shrink-0 opacity-90" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className={`block text-[10px] ${active ? 'text-emerald-100/80' : 'text-zinc-600'}`}>
                  {item.desc}
                </span>
              </span>
              {item.n != null && (
                <span
                  className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-lg ${
                    active ? 'bg-black/20' : 'bg-white/5 text-zinc-500'
                  }`}
                >
                  {item.n}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        <Link
          href="/eventos"
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition"
          onClick={() => setSidebarOpen(false)}
        >
          <ChevronRight size={16} /> Programação
        </Link>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-red-400/90 hover:bg-red-950/30 transition"
        >
          <LogOut size={16} /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-950">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-16 z-40 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
        >
          <Menu size={18} /> Menu
        </button>
        <div className="text-sm font-medium text-white truncate">Meus Ingressos</div>
        <div className="w-16 text-right text-[10px] text-zinc-500 tabular-nums">{counts.tickets} tick.</div>
      </div>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-[min(100%,288px)] h-full bg-zinc-900 border-r border-white/10 shadow-2xl animate-in slide-in-from-left">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="max-w-6xl mx-auto lg:px-6 lg:py-8 flex gap-0 lg:gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-72 shrink-0 rounded-3xl border border-white/10 bg-zinc-900/60 overflow-hidden sticky top-24 h-[calc(100vh-8rem)]">
          {sidebar}
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 px-4 py-5 sm:px-6 lg:px-0 lg:py-0 pb-24 lg:pb-8">
          {nav === 'conta' ? (
            <div className="space-y-4 max-w-xl">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Conta</h1>
                <p className="text-sm text-zinc-500 mt-1">Sessão e opções opcionais</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-5 space-y-4">
                <div>
                  <div className="text-xs text-zinc-500">Acessando como</div>
                  <div className="font-medium text-white mt-0.5 break-all">{displayName}</div>
                </div>
                {showSetPassword && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <Lock className="w-4 h-4 text-emerald-400 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium">Criar senha (opcional)</div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          Próximas vezes: e-mail/CPF + senha, sem o código.
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        className="input flex-1"
                        placeholder="Nova senha"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-primary px-5"
                        onClick={async () => {
                          if (!newPassword) return toast.error('Preencha a senha');
                          const cleaned = cleanDigits(email);
                          const payload: Record<string, string> = { password: newPassword };
                          if (code) payload.code = code;
                          if (cleaned.length === 11) payload.cpf = cleaned;
                          else if (email) payload.email = email;
                          const res = await fetch('/api/orders/lookup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                          });
                          if (res.ok) {
                            toast.success('Senha salva!');
                            setShowSetPassword(false);
                            setPassword(newPassword);
                          } else toast.error('Não foi possível salvar');
                        }}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
                <button type="button" onClick={logout} className="btn btn-secondary w-full text-red-400 border-red-500/20">
                  <LogOut size={16} className="mr-2" /> Sair desta sessão
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                    {nav === 'proximos' && 'Próximos eventos'}
                    {nav === 'passados' && 'Eventos passados'}
                    {nav === 'todos' && 'Todos os ingressos'}
                  </h1>
                  <p className="text-sm text-zinc-500 mt-1">
                    {visibleOrders.length === 0
                      ? 'Nada por aqui'
                      : `${visibleOrders.length} pedido(s) nesta lista`}
                  </p>
                </div>
                {/* Chips mobile quick filter */}
                <div className="flex lg:hidden gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {navItems
                    .filter((i) => i.id !== 'conta')
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setNav(item.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                          nav === item.id
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'border-white/10 text-zinc-400'
                        }`}
                      >
                        {item.label} {item.n != null ? `(${item.n})` : ''}
                      </button>
                    ))}
                </div>
              </div>

              {showSetPassword && nav !== 'conta' && (
                <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-950/15 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-emerald-200/90">Quer criar senha opcional?</span>
                  <button
                    type="button"
                    className="text-xs font-medium text-emerald-400 hover:underline"
                    onClick={() => setNav('conta')}
                  >
                    Ir para Conta →
                  </button>
                </div>
              )}

              {visibleOrders.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-zinc-900/40 px-6 py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center mx-auto mb-4">
                    <Ticket className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="font-medium text-zinc-300">Nenhum ingresso nesta aba</p>
                  <p className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">
                    {nav === 'proximos'
                      ? 'Eventos futuros com ingresso válido aparecem aqui. Estornos ficam em Estornos.'
                      : nav === 'estornos'
                        ? 'Você não tem pedidos estornados.'
                        : 'Tente outra aba no menu.'}
                  </p>
                  {nav !== 'todos' && (
                    <button
                      type="button"
                      onClick={() => setNav('todos')}
                      className="mt-4 text-sm text-emerald-400 hover:underline"
                    >
                      Ver todos
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">{visibleOrders.map(renderOrderCard)}</div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Bottom nav mobile — 5 itens: scroll horizontal se precisar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-zinc-950/95 backdrop-blur safe-area-pb">
        <div className="flex overflow-x-auto max-w-lg mx-auto scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = nav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setNav(item.id)}
                className={`flex flex-col items-center gap-0.5 py-2.5 px-3 min-w-[4.5rem] flex-1 text-[10px] font-medium transition ${
                  active ? 'text-emerald-400' : 'text-zinc-500'
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
                {item.label}
                {item.n != null && item.n > 0 && (
                  <span className="tabular-nums text-[9px] opacity-80">{item.n}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* QR modal */}
      {previewTicket && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPreviewTicket(null)}
        >
          <div
            className="bg-zinc-950 border border-white/10 rounded-t-[1.75rem] sm:rounded-3xl w-full max-w-sm p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5 sm:hidden" />
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 mb-3">
              Apresente na entrada
            </div>
            <div className="mx-auto w-[min(100%,240px)] bg-white p-4 rounded-2xl mb-4">
              <QRCode value={previewTicket.payload} size={200} className="w-full h-auto" />
            </div>
            <div className="font-semibold text-lg text-white leading-snug px-2">
              {previewTicket.event}
            </div>
            <div className="text-xs text-zinc-500 mt-1">{previewTicket.date}</div>
            <div className="font-mono text-xl text-emerald-400 tracking-[0.15em] mt-2">
              {previewTicket.code}
            </div>
            <div className="text-zinc-400 text-sm mt-1">{previewTicket.name}</div>
            <button
              type="button"
              onClick={() => setPreviewTicket(null)}
              className="mt-6 w-full py-3.5 rounded-2xl bg-white text-black text-sm font-semibold"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
