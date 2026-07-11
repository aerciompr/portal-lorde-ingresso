'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { formatPrice, formatDate } from '@/lib/utils';
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
  ChevronRight,
  Ticket,
  Clock,
  History,
  LayoutGrid,
  X,
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
type FilterTab = 'proximos' | 'passados' | 'todos';

function eventDate(d: string | Date) {
  return new Date(d);
}

function isUpcoming(d: string | Date) {
  const end = eventDate(d);
  // considera “passado” após o fim do dia do evento (UTC-3 roughly: +1 day buffer)
  const limit = new Date(end);
  limit.setHours(23, 59, 59, 999);
  return limit.getTime() >= Date.now();
}

function statusLabel(status: string) {
  if (status === 'paid') return { text: 'Pago', cls: 'bg-emerald-500/15 text-emerald-400' };
  if (status === 'refunded') return { text: 'Estornado', cls: 'bg-red-500/15 text-red-400' };
  if (status === 'cancelled') return { text: 'Cancelado', cls: 'bg-zinc-500/20 text-zinc-400' };
  return { text: status, cls: 'bg-amber-500/15 text-amber-400' };
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
  const [filter, setFilter] = useState<FilterTab>('proximos');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

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
    const hasHash = list.some((o) => !!(o as Order & { buyerPasswordHash?: string }).buyerPasswordHash);
    setShowSetPassword(!hasHash);
    // Abre o primeiro pedido próximo por padrão
    const firstUp = list.find((o) => isUpcoming(o.event.date) && o.status === 'paid');
    setExpandedOrder((firstUp || list[0])?.id || null);
    setFilter(list.some((o) => isUpcoming(o.event.date)) ? 'proximos' : 'passados');
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

  const { upcoming, past, counts } = useMemo(() => {
    const up: Order[] = [];
    const pa: Order[] = [];
    for (const o of orders) {
      if (isUpcoming(o.event.date)) up.push(o);
      else pa.push(o);
    }
    up.sort((a, b) => eventDate(a.event.date).getTime() - eventDate(b.event.date).getTime());
    pa.sort((a, b) => eventDate(b.event.date).getTime() - eventDate(a.event.date).getTime());
    return {
      upcoming: up,
      past: pa,
      counts: {
        proximos: up.length,
        passados: pa.length,
        todos: orders.length,
        tickets: orders.reduce((s, o) => s + o.tickets.length, 0),
      },
    };
  }, [orders]);

  const visibleOrders =
    filter === 'proximos' ? upcoming : filter === 'passados' ? past : [...upcoming, ...past];

  function onEmailChange(val: string) {
    const digits = cleanDigits(val);
    if (digits.length > 0 && digits.length <= 11 && /^[0-9.\- ]*$/.test(val)) {
      setEmail(formatCpf(val));
    } else setEmail(val);
  }

  return (
    <div className="min-h-[70vh] pb-16">
      {/* Hero compacto no mobile */}
      <div className="relative border-b border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black px-4 py-8 sm:py-12 sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff06_1px,transparent_1px)] bg-[length:4px_4px] opacity-60" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="uppercase text-emerald-400 text-[10px] sm:text-xs tracking-[3px] mb-1">
            Lorde Nelson
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tighter text-white">
            Meus Ingressos
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-md">
            {loggedIn
              ? `${counts.tickets} ingresso(s) · ${counts.proximos} evento(s) por vir`
              : 'Sem cadastro obrigatório — use o código da compra ou sua senha'}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-4 sm:-mt-6 relative z-10">
        {/* ── LOGIN ── */}
        {!loggedIn && (
          <div className="card shadow-2xl border-white/10">
            {justPaid && (
              <div className="px-4 py-3 sm:px-5 bg-emerald-950/50 border-b border-emerald-500/20 text-sm text-emerald-100">
                <p className="font-medium">Pagamento confirmado</p>
                <p className="text-xs text-emerald-200/80 mt-0.5">
                  {code
                    ? `Seu código ${code} já está preenchido — toque em Ver ingressos.`
                    : 'Informe o código LN-… mostrado após o PIX.'}
                </p>
              </div>
            )}

            {/* Abas login — touch friendly */}
            <div className="flex p-1.5 m-3 sm:m-4 bg-zinc-950 rounded-2xl border border-white/10">
              <button
                type="button"
                onClick={() => setLoginTab('codigo')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition ${
                  loginTab === 'codigo'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <KeyRound size={16} />
                Código
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
                <Mail size={16} />
                Senha
              </button>
            </div>

            <div className="px-4 pb-5 sm:px-6 sm:pb-6 space-y-3">
              {loginTab === 'codigo' ? (
                <>
                  <p className="text-xs text-zinc-500">
                    Código <strong className="text-zinc-300">LN-…</strong> da tela do PIX ou do e-mail.
                    Não precisa criar conta.
                  </p>
                  <input
                    type="text"
                    className="input"
                    placeholder="E-mail da compra (opcional)"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    autoComplete="email"
                  />
                  <input
                    className="input font-mono tracking-[0.25em] text-center text-lg sm:text-xl uppercase"
                    placeholder="LN-XXXXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && lookup(false)}
                    maxLength={12}
                    inputMode="text"
                    autoCapitalize="characters"
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
                  <p className="text-xs text-zinc-500">
                    Só se você já salvou uma senha depois da primeira visita.
                  </p>
                  <input
                    type="text"
                    className="input"
                    placeholder="E-mail ou CPF"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    autoComplete="username"
                  />
                  <input
                    type="password"
                    className="input"
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && lookup(true)}
                    autoComplete="current-password"
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
              <p className="text-[11px] text-zinc-500 text-center pt-1">
                Perdeu o código? WhatsApp do Lorde com o e-mail/CPF da compra.
              </p>
            </div>
          </div>
        )}

        {/* ── LOGADO ── */}
        {loggedIn && (
          <>
            {/* Barra de sessão */}
            <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="text-xs text-zinc-500">Acessando como</div>
                <div className="font-medium text-white truncate text-sm sm:text-base">
                  {email || orders[0]?.buyerEmail || 'Cliente'}
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 px-3 py-2 rounded-xl border border-red-500/20 hover:bg-red-950/30"
              >
                <LogOut size={14} /> Sair
              </button>
            </div>

            {/* Filtros — scroll horizontal no mobile */}
            <div className="mb-4 -mx-1 px-1 overflow-x-auto scrollbar-none">
              <div className="flex gap-2 min-w-max pb-1">
                {(
                  [
                    { id: 'proximos' as const, label: 'Próximos', icon: Clock, n: counts.proximos },
                    { id: 'passados' as const, label: 'Passados', icon: History, n: counts.passados },
                    { id: 'todos' as const, label: 'Todos', icon: LayoutGrid, n: counts.todos },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilter(t.id)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium border transition whitespace-nowrap ${
                      filter === t.id
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-zinc-900/80 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <t.icon size={14} />
                    {t.label}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums ${
                        filter === t.id ? 'bg-black/20' : 'bg-white/5'
                      }`}
                    >
                      {t.n}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Senha opcional */}
            {showSetPassword && (
              <div className="mb-4 p-4 rounded-2xl border border-emerald-500/25 bg-emerald-950/20">
                <div className="flex items-start gap-2 mb-3">
                  <Lock className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">Opcional: criar senha</div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      Próximas vezes: e-mail/CPF + senha. Pode pular.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ml-auto p-1 text-zinc-500 hover:text-white"
                    onClick={() => setShowSetPassword(false)}
                    aria-label="Fechar"
                  >
                    <X size={16} />
                  </button>
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
                    className="btn btn-primary px-5 py-3 shrink-0"
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
                      } else toast.error('Não foi possível salvar a senha');
                    }}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )}

            {visibleOrders.length === 0 && (
              <div className="card p-10 text-center">
                <Ticket className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="font-medium">
                  {filter === 'proximos'
                    ? 'Nenhum evento próximo'
                    : filter === 'passados'
                      ? 'Nenhum evento passado'
                      : 'Nenhum ingresso'}
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  {filter !== 'todos' && (
                    <button
                      type="button"
                      className="text-emerald-400 hover:underline"
                      onClick={() => setFilter('todos')}
                    >
                      Ver todos
                    </button>
                  )}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {visibleOrders.map((order) => {
                const st = statusLabel(order.status);
                const up = isUpcoming(order.event.date);
                const open = expandedOrder === order.id;
                return (
                  <div
                    key={order.id}
                    className={`card overflow-hidden ${up && order.status === 'paid' ? 'border-emerald-500/25' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedOrder(open ? null : order.id)}
                      className="w-full text-left px-4 py-4 sm:px-5 flex gap-3 items-start hover:bg-white/[0.02] transition"
                    >
                      <div
                        className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        <Calendar size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                          <h3 className="font-semibold text-base sm:text-lg tracking-tight text-white truncate">
                            {order.event.title}
                          </h3>
                          <span className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-md ${st.cls}`}>
                            {st.text}
                          </span>
                          {!up && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500">
                              Encerrado
                            </span>
                          )}
                        </div>
                        <div className="text-xs sm:text-sm text-zinc-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{formatDate(order.event.date)}</span>
                          <span className="text-zinc-600">·</span>
                          <span>
                            {order.tickets.length} ingresso
                            {order.tickets.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span>{formatPrice(order.totalCents)}</span>
                        </div>
                      </div>
                      <ChevronRight
                        size={18}
                        className={`text-zinc-500 shrink-0 mt-2 transition ${open ? 'rotate-90' : ''}`}
                      />
                    </button>

                    {open && (
                      <div className="border-t border-white/10 px-4 pb-4 sm:px-5 sm:pb-5 space-y-3">
                        <div className="flex items-start gap-2 text-xs text-zinc-500 pt-3">
                          <MapPin size={14} className="mt-0.5 shrink-0" />
                          <span>{order.event.address}</span>
                        </div>

                        {order.tickets.map((t) => (
                          <div
                            key={t.id}
                            className="rounded-2xl bg-zinc-950/80 border border-white/8 p-3.5 sm:p-4"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-sm sm:text-base">
                                  {t.ticketType.name}
                                </div>
                                <div className="font-mono text-emerald-400 text-sm tracking-wide mt-0.5">
                                  {t.uniqueCode}
                                </div>
                                {t.status !== 'valid' && (
                                  <div className="text-[10px] text-zinc-500 mt-1 uppercase">
                                    {t.status}
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
                                <button
                                  type="button"
                                  onClick={() => downloadPDF(t.id)}
                                  className="btn btn-secondary text-xs sm:text-sm py-2.5 px-3 flex items-center justify-center gap-1.5"
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
                                  className="btn btn-primary text-xs sm:text-sm py-2.5 px-3 flex items-center justify-center gap-1.5"
                                >
                                  <QrCode size={14} /> QR Code
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}

                        {order.status === 'paid' && canCancel(order) && (
                          <button
                            type="button"
                            onClick={() => requestCancel(order)}
                            className="text-xs text-red-400/90 hover:text-red-300 underline-offset-2 hover:underline"
                          >
                            Solicitar cancelamento deste pedido
                          </button>
                        )}

                        {order.cancellationRequests.length > 0 && (
                          <div className="text-xs rounded-xl px-3 py-2 bg-amber-950/40 text-amber-200/90 border border-amber-500/20">
                            Cancelamento: <strong>{order.cancellationRequests[0].status}</strong>
                            {order.cancellationRequests[0].reason
                              ? ` — ${order.cancellationRequests[0].reason}`
                              : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-center text-[11px] text-zinc-600 mt-8 max-w-sm mx-auto">
              Apresente o QR na entrada. Cancelamentos seguem as regras do organizador.
            </p>
          </>
        )}

        {searched && !loggedIn && (
          <div className="mt-6 text-center py-8 text-zinc-500 text-sm">
            Nenhum ingresso com esses dados. Confira o código ou a senha.
          </div>
        )}
      </div>

      {/* Modal QR — fullscreen-friendly no mobile */}
      {previewTicket && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPreviewTicket(null)}
        >
          <div
            className="bg-zinc-950 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 text-center shadow-2xl safe-area-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="uppercase tracking-[2px] text-emerald-400 text-[10px] mb-3">
              Apresente na entrada
            </div>
            <div className="mx-auto w-[min(100%,240px)] bg-white p-4 rounded-2xl mb-4">
              <QRCode value={previewTicket.payload} size={200} className="w-full h-auto" />
            </div>
            <div className="font-semibold text-lg text-white leading-snug px-2">
              {previewTicket.event}
            </div>
            <div className="text-xs text-zinc-500 mt-1">{previewTicket.date}</div>
            <div className="font-mono text-xl text-emerald-400 tracking-[3px] mt-2">
              {previewTicket.code}
            </div>
            <div className="text-zinc-400 text-sm mt-1">{previewTicket.name}</div>
            <button
              type="button"
              onClick={() => setPreviewTicket(null)}
              className="mt-6 w-full py-3.5 rounded-2xl bg-white text-black text-sm font-medium"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
