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
  X,
  Menu,
  User,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Undo2,
  Copy,
  Check,
  DoorOpen,
  ExternalLink,
} from 'lucide-react';
import { WHATSAPP_DISPLAY, WHATSAPP_HREF } from '@/lib/contact';
import PurchaseSuccessModal from '@/components/PurchaseSuccessModal';
import {
  eventDate,
  isUpcoming,
  isRefunded,
  isActiveUpcoming,
  relativeEventLabel,
  formatDateShort,
  partitionOrders,
} from '@/lib/meus-ingressos';

interface TicketItem {
  id: string;
  uniqueCode: string;
  status: string;
  qrPayload?: string | null;
  ticketType: { name: string; priceCents: number };
}

interface Order {
  id: string;
  totalCents: number;
  status: string;
  accessCode?: string | null;
  buyerName: string;
  buyerEmail: string;
  buyerPasswordHash?: string | null;
  /** API sanitizada — true se o comprador já tem senha (hash nunca vem no JSON) */
  hasPassword?: boolean;
  event: {
    id: string;
    title: string;
    date: string | Date;
    address: string;
    imageUrl?: string | null;
  };
  tickets: TicketItem[];
  cancellationRequests: { id: string; status: string; reason: string }[];
}

type LoginTab = 'codigo' | 'senha';
type NavId = 'proximos' | 'passados' | 'estornos' | 'conta';

function statusBadge(status: string) {
  const text = orderStatusLabel(status);
  const s = (status || '').toLowerCase();
  if (s === 'paid') return { text, cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' };
  if (s === 'refunded') return { text, cls: 'bg-red-500/15 text-red-400 ring-red-500/20' };
  if (s === 'cancelled' || s === 'canceled')
    return { text, cls: 'bg-zinc-500/20 text-zinc-400 ring-zinc-500/20' };
  return { text, cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/20' };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Link Google Calendar (UTC approx via local ISO) */
function googleCalendarUrl(order: Order) {
  const start = eventDate(order.event.date);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: order.event.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Ingresso Lorde Nelson${order.accessCode ? ` · Pedido ${order.accessCode}` : ''}`,
    location: order.event.address || 'Lorde Nelson Rest Pub',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function ticketQrValue(t: TicketItem) {
  return (t.qrPayload && t.qrPayload.trim()) || t.uniqueCode;
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
  const [welcomeOpen, setWelcomeOpen] = useState(false);
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hidePwBanner, setHidePwBanner] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('hidePwBanner') === '1';
    } catch {
      return false;
    }
  });

  const loggedIn = orders.length > 0;

  async function handleCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      toast.success('Copiado');
      setTimeout(() => setCopiedKey(null), 1800);
    } else toast.error('Não foi possível copiar');
  }

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
    const hasHash = list.some((o) => !!(o as Order).hasPassword || !!(o as Order).buyerPasswordHash);
    setShowSetPassword(!hasHash);
    setNav(list.some((o) => isActiveUpcoming(o)) ? 'proximos' : list.some(isRefunded) ? 'estornos' : 'passados');
    setSidebarOpen(false);
  }

  function lookupWith(e: string, c: string, p?: string) {
    setLoading(true);
    const cleaned = cleanDigits(e);

    // Senha: só POST (nunca na URL). Código: GET com code.
    const run = p
      ? fetch('/api/orders/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login',
            password: p,
            ...(cleaned.length === 11 ? { cpf: cleaned } : e ? { email: e } : {}),
          }),
        })
      : (() => {
          const params = new URLSearchParams();
          if (cleaned.length === 11) params.set('cpf', cleaned);
          else if (e) params.set('email', e);
          if (c) params.set('code', c);
          return fetch(`/api/orders/lookup?${params}`);
        })();

    run
      .then(async (r) => {
        const data = await r.json();
        if (r.status === 429) {
          toast.error(data.error || 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
          applyOrders([], e, c, p);
          return;
        }
        if (!r.ok && data.error) toast.error(data.error);
        applyOrders(data.orders || [], e, c, p);
      })
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
        try {
          if (!sessionStorage.getItem('welcomeShown')) {
            sessionStorage.setItem('welcomeShown', '1');
            setWelcomeOpen(true);
          }
        } catch {
          setWelcomeOpen(true);
        }
        // Evita reabrir o modal no F5 com a mesma URL
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('success');
          window.history.replaceState({}, '', url.pathname + url.search);
        } catch {}
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
    try {
      let res: Response;
      if (usePassword) {
        const cleaned = cleanDigits(email);
        res = await fetch('/api/orders/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login',
            password,
            ...(cleaned.length === 11 ? { cpf: cleaned } : { email }),
          }),
        });
      } else {
        const params = new URLSearchParams();
        const cleaned = cleanDigits(email);
        if (cleaned.length === 11) params.set('cpf', cleaned);
        else if (email) params.set('email', email);
        params.set('code', code);
        res = await fetch(`/api/orders/lookup?${params}`);
      }
      const data = await res.json();
      if (!res.ok && data.error) toast.error(data.error);
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

  async function downloadPDF(ticketId: string, orderAccessCode?: string | null) {
    // PDF exige código LN do pedido (ou sessão admin)
    const c =
      (orderAccessCode || '').trim() ||
      code ||
      (() => {
        try {
          const saved = localStorage.getItem('clientSession');
          return saved ? JSON.parse(saved).code || '' : '';
        } catch {
          return '';
        }
      })();
    // Se logou só com senha, pega accessCode de qualquer pedido carregado
    const fromOrders =
      c ||
      orders.find((o) => o.tickets?.some((t) => t.id === ticketId))?.accessCode ||
      orders[0]?.accessCode ||
      '';
    const q = fromOrders ? `?code=${encodeURIComponent(String(fromOrders).toUpperCase())}` : '';
    window.open(`/api/tickets/${ticketId}/pdf${q}`, '_blank');
  }

  async function requestCancel(order: Order) {
    const reason = prompt('Motivo do cancelamento (obrigatório):');
    if (!reason || reason.trim().length < 3) {
      toast.error('Informe um motivo (mín. 3 caracteres)');
      return;
    }
    const access =
      code ||
      order.accessCode ||
      orders.find((o) => o.accessCode)?.accessCode ||
      '';
    if (!access && !password) {
      toast.error('Entre com o código LN ou senha para solicitar cancelamento');
      return;
    }
    const cleaned = cleanDigits(email);
    const res = await fetch('/api/cancellations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        reason: reason.trim(),
        ...(access ? { code: access } : {}),
        ...(password ? { password, email, ...(cleaned.length === 11 ? { cpf: cleaned } : {}) } : {}),
      }),
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
    const p = partitionOrders(orders);
    return {
      upcoming: p.upcoming,
      past: p.past,
      refunded: p.refunded,
      counts: {
        proximos: p.upcoming.length,
        passados: p.past.length,
        estornos: p.refunded.length,
        validos: p.upcoming.length + p.past.length,
        todos: orders.length,
        ticketsValidos: p.counts.ticketsValidos,
        ticketsProximos: p.counts.ticketsProximos,
        ticketsPassados: p.counts.ticketsPassados,
        ticketsEstornos: p.counts.ticketsEstornos,
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
          : [];

  function onEmailChange(val: string) {
    const digits = cleanDigits(val);
    if (digits.length > 0 && digits.length <= 11 && /^[0-9.\- ]*$/.test(val)) {
      setEmail(formatCpf(val));
    } else setEmail(val);
  }

  const displayName = email || orders[0]?.buyerEmail || 'Cliente';
  /** Menu no estilo do admin — estornos só se existirem */
  const navItems: {
    id: NavId;
    label: string;
    icon: typeof Clock;
    n?: number;
    tone?: 'default' | 'danger';
  }[] = [
    {
      id: 'proximos',
      label: 'Próximos',
      icon: Sparkles,
      n: counts.ticketsProximos > 0 ? counts.ticketsProximos : undefined,
    },
    {
      id: 'passados',
      label: 'Passados',
      icon: History,
      n: counts.ticketsPassados > 0 ? counts.ticketsPassados : undefined,
    },
    ...(counts.ticketsEstornos > 0
      ? [
          {
            id: 'estornos' as const,
            label: 'Estornos',
            icon: Undo2,
            n: counts.ticketsEstornos,
            tone: 'danger' as const,
          },
        ]
      : []),
    { id: 'conta', label: 'Conta', icon: User },
  ];

  /** Primeiro ingresso válido por vir — CTA rápido mobile */
  const primaryDoorTicket = useMemo(() => {
    for (const o of upcoming) {
      if ((o.status || '').toLowerCase() !== 'paid') continue;
      const t = o.tickets.find((x) => x.status === 'valid' || !x.status);
      if (t) return { order: o, ticket: t };
    }
    return null;
  }, [upcoming]);

  const pageTitle =
    nav === 'proximos'
      ? 'Próximos eventos'
      : nav === 'passados'
        ? 'Eventos passados'
        : nav === 'estornos'
          ? 'Estornos'
          : 'Conta';

  const pageSubtitle =
    nav === 'conta'
      ? 'Sessão e opções opcionais'
      : visibleOrders.length === 0
        ? 'Nada por aqui'
        : nav === 'estornos'
          ? `${counts.ticketsEstornos} estorno(s) · não valem na entrada`
          : nav === 'proximos'
            ? `${counts.ticketsProximos} ingresso(s) válido(s) para usar`
            : `${counts.ticketsPassados} ingresso(s) de eventos passados`;

  // ─── LOGIN ─────────────────────────────────────────────
  if (!loggedIn) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col">
        <div className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
          <div className="relative max-w-lg mx-auto px-4 pt-10 pb-16 sm:pt-14 sm:pb-20 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/30 mb-4">
              {loading ? (
                <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
              ) : (
                <Ticket className="w-7 h-7 text-emerald-400" />
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              Meus Ingressos
            </h1>
            {loading && (
              <p className="mt-3 text-sm text-emerald-400/80 animate-pulse">Buscando seus ingressos…</p>
            )}
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
    const refunded = isRefunded(order);
    const up = !refunded && isUpcoming(order.event.date);
    const rel = relativeEventLabel(order.event.date, refunded);
    const img = order.event.imageUrl?.trim() || '';
    const when = formatDateShort(order.event.date);

    return (
      <article
        key={order.id}
        className={`rounded-3xl border overflow-hidden bg-zinc-900/90 shadow-xl shadow-black/30 ${
          refunded
            ? 'border-red-500/25'
            : up && order.status === 'paid'
              ? 'border-emerald-500/30'
              : 'border-white/10'
        }`}
      >
        {/* Capa do evento — sensação de ingresso de verdade */}
        <div className="relative h-36 sm:h-44 bg-zinc-800">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-zinc-900 to-zinc-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/55 to-zinc-950/10" />
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md ring-1 ${
                refunded
                  ? 'bg-red-950/80 text-red-200 ring-red-500/30'
                  : up
                    ? 'bg-emerald-950/80 text-emerald-200 ring-emerald-500/30'
                    : 'bg-zinc-950/80 text-zinc-300 ring-white/10'
              }`}
            >
              {refunded ? <Undo2 size={12} /> : <Calendar size={12} />}
              {rel}
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md ring-1 backdrop-blur-md ${st.cls}`}>
              {st.text}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
            <h2 className="font-semibold text-lg sm:text-xl text-white tracking-tight leading-snug drop-shadow">
              {order.event.title}
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-zinc-200/90 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Clock size={13} className="opacity-80" /> {when}
              </span>
              <span className="inline-flex items-center gap-1 min-w-0">
                <MapPin size={13} className="opacity-80 shrink-0" />
                <span className="truncate max-w-[16rem] sm:max-w-none">{order.event.address}</span>
              </span>
            </p>
          </div>
        </div>

        {/* Linha de picote (visual de ticket) */}
        <div className="relative h-4 bg-zinc-950/40">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-zinc-950 border border-white/5" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-zinc-950 border border-white/5" />
          <div className="absolute inset-x-5 top-1/2 border-t border-dashed border-white/15" />
        </div>

        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span>
              {refunded
                ? `${order.tickets.length} estorno${order.tickets.length !== 1 ? 's' : ''}`
                : `${order.tickets.length} ingresso${order.tickets.length !== 1 ? 's' : ''}`}
              {' · '}
              <span className="tabular-nums text-zinc-400">{formatPrice(order.totalCents)}</span>
            </span>
            {order.accessCode && (
              <button
                type="button"
                onClick={() => handleCopy(`order-${order.id}`, order.accessCode || '')}
                className="inline-flex items-center gap-1 text-zinc-400 hover:text-white transition"
                title="Copiar código do pedido"
              >
                {copiedKey === `order-${order.id}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span className="font-mono tracking-wide">{order.accessCode}</span>
              </button>
            )}
          </div>

          {refunded && (
            <div className="rounded-2xl border border-red-500/25 bg-red-950/30 px-3.5 py-3 text-xs text-red-100/90 leading-relaxed">
              <strong className="text-red-200">Pedido estornado.</strong> Não vale na porta — sem QR de
              entrada. Baixe o comprovante de estorno se precisar.
            </div>
          )}

          {up && !refunded && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[12rem] rounded-2xl border border-emerald-500/20 bg-emerald-950/25 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-emerald-100/90">
                <DoorOpen size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-emerald-200">Na entrada:</strong> mostre o QR (ou PDF). Titular:{' '}
                  {order.buyerName || '—'}.
                </span>
              </div>
              <a
                href={googleCalendarUrl(order)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-[11px] text-zinc-300 hover:bg-white/5 shrink-0"
              >
                <Calendar size={14} /> Calendário
                <ExternalLink size={11} className="opacity-50" />
              </a>
            </div>
          )}

          {order.tickets.map((t) => {
            const canUse = !refunded && order.status === 'paid' && (t.status === 'valid' || !t.status);
            const qrVal = ticketQrValue(t);
            return (
              <div
                key={t.id}
                className={`rounded-2xl border p-3.5 sm:p-4 ${
                  refunded
                    ? 'bg-zinc-950/60 border-red-500/15'
                    : canUse
                      ? 'bg-zinc-950/90 border-emerald-500/20'
                      : 'bg-zinc-950/90 border-white/8'
                }`}
              >
                <div className="flex gap-3 sm:gap-4">
                  {/* Mini QR no card — atalho visual */}
                  {canUse ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewTicket({
                          code: t.uniqueCode,
                          payload: qrVal,
                          name: order.buyerName,
                          event: order.event.title,
                          date: formatDate(order.event.date),
                        })
                      }
                      className="shrink-0 w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-xl bg-white p-1.5 ring-2 ring-emerald-500/40 hover:ring-emerald-400 transition shadow-lg shadow-emerald-950/40"
                      title="Abrir QR em tela cheia"
                    >
                      <QRCode value={qrVal} size={64} className="w-full h-full" />
                    </button>
                  ) : (
                    <div className="shrink-0 w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center">
                      {refunded ? (
                        <Undo2 className="w-7 h-7 text-red-400/70" />
                      ) : (
                        <Ticket className="w-7 h-7 text-zinc-600" />
                      )}
                    </div>
                  )}

                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="text-sm font-semibold text-zinc-50">{t.ticketType.name}</div>
                    <button
                      type="button"
                      onClick={() => handleCopy(`tkt-${t.id}`, t.uniqueCode)}
                      className={`mt-0.5 font-mono text-sm tracking-wider text-left inline-flex items-center gap-1.5 w-fit max-w-full ${
                        refunded ? 'text-zinc-500 line-through' : 'text-emerald-400 hover:text-emerald-300'
                      }`}
                      title="Copiar código do ingresso"
                    >
                      <span className="truncate">{t.uniqueCode}</span>
                      {copiedKey === `tkt-${t.id}` ? (
                        <Check size={12} className="shrink-0 text-emerald-400" />
                      ) : (
                        <Copy size={12} className="shrink-0 opacity-60" />
                      )}
                    </button>
                    <div className="text-[10px] text-zinc-500 mt-1">
                      {refunded
                        ? 'Cancelado (estorno) · sem entrada'
                        : t.status && t.status !== 'valid'
                          ? ticketStatusLabel(t.status)
                          : canUse
                            ? 'Toque no QR para ampliar'
                            : ticketStatusLabel(t.status)}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {refunded ? (
                        <button
                          type="button"
                          onClick={() => downloadPDF(t.id, order.accessCode)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 px-3.5 py-2.5 text-xs font-semibold text-white transition"
                        >
                          <Download size={14} /> Comprovante PDF
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewTicket({
                                code: t.uniqueCode,
                                payload: qrVal,
                                name: order.buyerName,
                                event: order.event.title,
                                date: formatDate(order.event.date),
                              })
                            }
                            className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition shadow-md shadow-emerald-950/40"
                          >
                            <QrCode size={16} /> Mostrar QR
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadPDF(t.id, order.accessCode)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-3 text-xs font-medium text-zinc-200 hover:bg-white/5 transition"
                          >
                            <Download size={14} /> PDF
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

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

  // ─── Shell no estilo do admin: sidebar fixa + área principal ───
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-950 text-white flex">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — mesmo padrão do admin */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-zinc-900 border-r border-white/10 flex flex-col transform transition-transform duration-200 ease-out lg:static lg:translate-x-0 lg:inset-auto lg:min-h-[calc(100vh-4rem)] ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-white/10 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25 shrink-0">
                  <Ticket className="w-4 h-4 text-emerald-400" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">Meus Ingressos</div>
                  <div className="text-[10px] text-zinc-500 truncate">{displayName}</div>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:bg-white/5"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 rounded-2xl bg-zinc-950/80 border border-emerald-500/25 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Para a porta</div>
                <div className="text-2xl font-semibold text-emerald-400 tabular-nums leading-none mt-1">
                  {counts.ticketsProximos}
                </div>
              </div>
              <DoorOpen className="w-8 h-8 text-emerald-500/40" />
            </div>
            <p className="text-[10px] text-zinc-500 mt-2">
              {counts.ticketsProximos === 1
                ? '1 ingresso válido por vir'
                : `${counts.ticketsProximos} ingressos válidos por vir`}
              {counts.ticketsPassados > 0 ? ` · ${counts.ticketsPassados} passado(s)` : ''}
            </p>
            {counts.ticketsEstornos > 0 && (
              <button
                type="button"
                onClick={() => {
                  setNav('estornos');
                  setSidebarOpen(false);
                }}
                className="mt-2 w-full text-left text-[10px] text-red-400/90 hover:text-red-300"
              >
                {counts.ticketsEstornos} estorno{counts.ticketsEstornos !== 1 ? 's' : ''} no histórico →
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto overscroll-contain">
          {navItems.map((item) => {
            const active = nav === item.id;
            const Icon = item.icon;
            const danger = item.tone === 'danger';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setNav(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-left transition cursor-pointer ${
                  active
                    ? danger
                      ? 'bg-red-500/15 text-red-400'
                      : 'bg-white/10 text-emerald-400'
                    : danger
                      ? 'text-red-400/70 hover:bg-red-950/30 hover:text-red-300'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={18} className="shrink-0 opacity-90" strokeWidth={active ? 2.25 : 1.75} />
                <span className="flex-1 font-medium">{item.label}</span>
                {item.n != null && (
                  <span
                    className={`text-[11px] font-semibold tabular-nums min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-md ${
                      active
                        ? danger
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-white/5 text-zinc-500'
                    }`}
                  >
                    {item.n}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-2 mt-2 border-t border-white/5 space-y-1">
            <Link
              href="/eventos"
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition"
              onClick={() => setSidebarOpen(false)}
            >
              <ChevronRight size={18} className="shrink-0" />
              <span>Programação</span>
            </Link>
          </div>
        </nav>

        <div className="shrink-0 p-4 border-t border-white/10 space-y-2">
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-sm py-2.5 rounded-lg border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10 flex items-center justify-center gap-2 transition"
          >
            <i className="fa-brands fa-whatsapp text-base" aria-hidden />
            Ajuda {WHATSAPP_DISPLAY}
          </a>
          <button
            type="button"
            onClick={logout}
            className="w-full text-sm py-2.5 rounded-lg bg-zinc-800 hover:bg-red-900/40 text-red-400 flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <LogOut size={15} /> Sair
          </button>
          <div className="text-[10px] text-center text-zinc-600">Área do cliente • Lorde Nelson</div>
        </div>
      </aside>

      {/* Coluna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-white/10 bg-zinc-900/80 backdrop-blur flex items-center px-4 sm:px-6 justify-between gap-3 sticky top-16 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-lg text-zinc-300 hover:bg-white/5"
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{pageTitle}</div>
              <div className="text-[11px] text-zinc-500 truncate hidden sm:block">{pageSubtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm shrink-0">
            {primaryDoorTicket && nav === 'proximos' && (
              <button
                type="button"
                onClick={() =>
                  setPreviewTicket({
                    code: primaryDoorTicket.ticket.uniqueCode,
                    payload: ticketQrValue(primaryDoorTicket.ticket),
                    name: primaryDoorTicket.order.buyerName,
                    event: primaryDoorTicket.order.event.title,
                    date: formatDate(primaryDoorTicket.order.event.date),
                  })
                }
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <QrCode size={14} /> Mostrar QR
              </button>
            )}
            <span className="text-[11px] text-emerald-400 tabular-nums">
              {counts.ticketsProximos} por vir
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden pb-24 sm:pb-8">
          {nav === 'conta' ? (
            <div className="space-y-4 max-w-xl">
              <div className="mb-2">
                <h1 className="text-2xl font-semibold tracking-tight text-white">Conta</h1>
                <p className="text-sm text-zinc-500 mt-1">Sessão e opções opcionais</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5 space-y-4">
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
                          const access =
                            code ||
                            orders.find((o) => o.accessCode)?.accessCode ||
                            '';
                          if (!access) {
                            return toast.error(
                              'Para criar senha, entre com o código LN-… da compra'
                            );
                          }
                          const cleaned = cleanDigits(email);
                          const payload: Record<string, string> = {
                            password: newPassword,
                            code: access,
                          };
                          if (cleaned.length === 11) payload.cpf = cleaned;
                          else if (email) payload.email = email;
                          const res = await fetch('/api/orders/lookup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (res.ok) {
                            toast.success('Senha salva!');
                            setShowSetPassword(false);
                            setPassword(newPassword);
                            if (!code && access) setCode(String(access).toUpperCase());
                          } else toast.error(data.error || 'Não foi possível salvar');
                        }}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={logout}
                  className="btn btn-secondary w-full text-red-400 border-red-500/20"
                >
                  <LogOut size={16} className="mr-2" /> Sair desta sessão
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl space-y-4">
              {/* Título só no desktop — no mobile o sticky header já mostra */}
              <div className="hidden lg:block mb-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-1">Carteira</p>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                  {pageTitle}
                </h1>
                <p className="text-sm text-zinc-500 mt-1">{pageSubtitle}</p>
              </div>
              <p className="lg:hidden text-sm text-zinc-500 -mt-1">{pageSubtitle}</p>

              {justPaid && nav === 'proximos' && (
                <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/50 to-zinc-900/80 px-4 py-4 sm:px-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-emerald-100">Pagamento confirmado</p>
                      <p className="text-sm text-emerald-200/70 mt-0.5 leading-relaxed">
                        Seu ingresso está pronto. Use <strong className="text-emerald-200">Mostrar QR</strong>{' '}
                        na porta.
                      </p>
                      {primaryDoorTicket && (
                        <button
                          type="button"
                          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white"
                          onClick={() =>
                            setPreviewTicket({
                              code: primaryDoorTicket.ticket.uniqueCode,
                              payload: ticketQrValue(primaryDoorTicket.ticket),
                              name: primaryDoorTicket.order.buyerName,
                              event: primaryDoorTicket.order.event.title,
                              date: formatDate(primaryDoorTicket.order.event.date),
                            })
                          }
                        >
                          <QrCode size={16} /> Mostrar QR agora
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {showSetPassword && !hidePwBanner && (
                <div className="rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-zinc-300">
                    Opcional: crie senha para entrar sem o código LN nas próximas vezes.
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                      onClick={() => {
                        setHidePwBanner(true);
                        try {
                          localStorage.setItem('hidePwBanner', '1');
                        } catch {}
                      }}
                    >
                      Agora não
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-emerald-400 hover:underline"
                      onClick={() => setNav('conta')}
                    >
                      Criar senha →
                    </button>
                  </div>
                </div>
              )}

              {visibleOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/40 px-6 py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center mx-auto mb-4">
                    <Ticket className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="font-medium text-zinc-300">
                    {nav === 'estornos' ? 'Nenhum estorno' : 'Nenhum ingresso nesta aba'}
                  </p>
                  <p className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">
                    {nav === 'proximos'
                      ? 'Só aparecem aqui ingressos válidos de eventos futuros. Estornos ficam no menu Estornos.'
                      : nav === 'estornos'
                        ? 'Você não tem pedidos estornados.'
                        : nav === 'passados'
                          ? 'Quando o evento passar, o ingresso aparece aqui. Enquanto isso, confira a programação.'
                          : 'Use o menu lateral para trocar de seção.'}
                  </p>
                  {nav === 'proximos' && counts.ticketsEstornos > 0 && (
                    <button
                      type="button"
                      onClick={() => setNav('estornos')}
                      className="mt-4 text-sm text-red-400 hover:underline"
                    >
                      Ver {counts.ticketsEstornos} estorno{counts.ticketsEstornos !== 1 ? 's' : ''} →
                    </button>
                  )}
                  {nav === 'estornos' && counts.ticketsProximos > 0 && (
                    <button
                      type="button"
                      onClick={() => setNav('proximos')}
                      className="mt-4 text-sm text-emerald-400 hover:underline"
                    >
                      Ver próximos válidos →
                    </button>
                  )}
                  {nav === 'passados' && (
                    <Link
                      href="/eventos"
                      className="mt-4 inline-flex text-sm text-emerald-400 hover:underline"
                    >
                      Ver programação →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-4">{visibleOrders.map(renderOrderCard)}</div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modal boas-vindas pós-compra */}
      {loggedIn && (
        <PurchaseSuccessModal
          open={welcomeOpen && justPaid}
          onClose={() => setWelcomeOpen(false)}
          variant="welcome"
          accessCode={
            code ||
            orders.find((o) => o.accessCode)?.accessCode ||
            ''
          }
          email={email || orders[0]?.buyerEmail || ''}
          eventTitle={upcoming[0]?.event.title || orders[0]?.event.title}
          primaryLabel={primaryDoorTicket ? 'Mostrar QR agora' : 'Ver carteira'}
          onPrimary={() => {
            setWelcomeOpen(false);
            if (primaryDoorTicket) {
              setPreviewTicket({
                code: primaryDoorTicket.ticket.uniqueCode,
                payload: ticketQrValue(primaryDoorTicket.ticket),
                name: primaryDoorTicket.order.buyerName,
                event: primaryDoorTicket.order.event.title,
                date: formatDate(primaryDoorTicket.order.event.date),
              });
            } else {
              setNav('proximos');
            }
          }}
          secondaryLabel="Fechar e ver carteira"
          onSecondary={() => {
            setWelcomeOpen(false);
            setNav('proximos');
          }}
        />
      )}

      {/* CTA fixo mobile — prioridade: mostrar QR na porta */}
      {loggedIn && primaryDoorTicket && nav === 'proximos' && !previewTicket && !welcomeOpen && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pointer-events-none">
          <button
            type="button"
            className="pointer-events-auto w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2"
            onClick={() =>
              setPreviewTicket({
                code: primaryDoorTicket.ticket.uniqueCode,
                payload: ticketQrValue(primaryDoorTicket.ticket),
                name: primaryDoorTicket.order.buyerName,
                event: primaryDoorTicket.order.event.title,
                date: formatDate(primaryDoorTicket.order.event.date),
              })
            }
          >
            <QrCode size={18} /> Mostrar QR na entrada
          </button>
        </div>
      )}

      {/* QR modal — tela de entrada */}
      {previewTicket && (
        <div
          className="fixed inset-0 z-[70] bg-black flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPreviewTicket(null)}
        >
          <div
            className="bg-zinc-950 border border-white/10 rounded-t-[1.75rem] sm:rounded-3xl w-full max-w-md p-6 sm:p-8 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5 sm:hidden" />
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-emerald-400 mb-4">
              <DoorOpen size={12} /> Apresente na entrada
            </div>
            <div className="mx-auto w-[min(100%,280px)] bg-white p-5 rounded-2xl mb-5 ring-4 ring-emerald-500/25">
              <QRCode value={previewTicket.payload} size={240} className="w-full h-auto" />
            </div>
            <div className="font-semibold text-lg sm:text-xl text-white leading-snug px-2">
              {previewTicket.event}
            </div>
            <div className="text-xs text-zinc-500 mt-1">{previewTicket.date}</div>
            <button
              type="button"
              onClick={() => handleCopy('modal-code', previewTicket.code)}
              className="font-mono text-xl text-emerald-400 tracking-[0.15em] mt-3 inline-flex items-center gap-2 mx-auto hover:text-emerald-300"
            >
              {previewTicket.code}
              {copiedKey === 'modal-code' ? <Check size={16} /> : <Copy size={16} className="opacity-60" />}
            </button>
            <div className="text-zinc-400 text-sm mt-1">{previewTicket.name}</div>
            <p className="text-[11px] text-amber-200/80 mt-4 rounded-xl bg-amber-950/40 border border-amber-500/20 px-3 py-2">
              Aumente o brilho da tela se a portaria pedir.
            </p>
            <button
              type="button"
              onClick={() => setPreviewTicket(null)}
              className="mt-5 w-full py-3.5 rounded-2xl bg-white text-black text-sm font-semibold"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
