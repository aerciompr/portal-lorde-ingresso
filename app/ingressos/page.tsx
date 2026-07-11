'use client';

import { useState, useEffect, useRef } from 'react';
import { formatPrice, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import QRCode from 'react-qr-code';
import { formatCpf, cleanDigits } from '@/lib/masks';
import { Mail, KeyRound, Lock, LogOut, Download, QrCode } from 'lucide-react';

interface Ticket {
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
  event: { id: string; title: string; date: string | Date; address: string };
  tickets: Ticket[];
  cancellationRequests: { id: string; status: string; reason: string }[];
}

export default function MeusIngressos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [previewTicket, setPreviewTicket] = useState<{ code: string; payload: string; name: string; event: string } | null>(null);

  // URL (pós-compra) tem prioridade; senão localStorage
  const [email, setEmail] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('email')) return q.get('email') || '';
      const saved = localStorage.getItem('clientSession');
      if (saved) {
        const { email: sEmail } = JSON.parse(saved);
        return sEmail || '';
      }
    } catch {}
    return '';
  });
  const [code, setCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('code')) return (q.get('code') || '').toUpperCase();
      const saved = localStorage.getItem('clientSession');
      if (saved) {
        const { code: sCode } = JSON.parse(saved);
        return sCode || '';
      }
    } catch {}
    return '';
  });

  const [password, setPassword] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const q = new URLSearchParams(window.location.search);
      // pós-compra: não usa senha da session antiga
      if (q.get('success') === '1' || q.get('code')) return '';
      const saved = localStorage.getItem('clientSession');
      if (saved) {
        const { password: sPass } = JSON.parse(saved);
        return sPass || '';
      }
    } catch {}
    return '';
  });
  const [newPassword, setNewPassword] = useState('');
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [justPaid, setJustPaid] = useState(false);

  const [activeTab, setActiveTab] = useState<'senha' | 'codigo'>(() => {
    if (typeof window === 'undefined') return 'senha';
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('code') || q.get('success') === '1') return 'codigo';
    } catch {}
    return 'senha';
  });

  function lookupWith(e: string, c: string, p?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    const cleaned = cleanDigits(e);
    if (cleaned.length === 11) {
      params.set('cpf', cleaned);
    } else if (e) {
      params.set('email', e);
    }
    if (c) params.set('code', c);
    if (p) params.set('password', p);
    fetch(`/api/orders/lookup?${params}`)
      .then(r => r.json())
      .then(data => {
        setOrders(data.orders || []);
        setSearched(true);
        if ((data.orders || []).length === 0) toast.info('Nenhum ingresso ou código inválido');
        else {
          localStorage.setItem('clientSession', JSON.stringify({ email: e, code: c || '', password: p || '' }));
          // show set password if none set
          const hasHash = data.orders.some((o: any) => o.buyerPasswordHash);
          setShowSetPassword(!hasHash);
        }
      })
      .catch(() => toast.error('Erro'))
      .finally(() => setLoading(false));
  }

  // Auto-trigger lookup once if restored from storage / pós-compra
  const didAutoLookup = useRef(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('success') === '1') {
        setJustPaid(true);
        toast.success('Pagamento confirmado! Seus ingressos estão abaixo.');
      }
    }
    if (!didAutoLookup.current && email && (code || password)) {
      didAutoLookup.current = true;
      lookupWith(email, code, password);
    } else if (!didAutoLookup.current && code) {
      didAutoLookup.current = true;
      lookupWith(email, code);
    }
  }, [email, code, password]);

  async function lookup(usePassword = false) {
    if (!email && !code && !password) {
      toast.error('Informe email/cpf + senha ou código');
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    const cleaned = cleanDigits(email);
    if (cleaned.length === 11) {
      params.set('cpf', cleaned);
    } else if (email) {
      params.set('email', email);
    }
    if (code) params.set('code', code);
    if (usePassword && password) params.set('password', password);
    try {
      const res = await fetch(`/api/orders/lookup?${params}`);
      const data = await res.json();
      setOrders(data.orders || []);
      setSearched(true);
      if ((data.orders || []).length === 0) {
        toast.info('Nenhum ingresso ou credenciais inválidas');
      } else {
        localStorage.setItem('clientSession', JSON.stringify({ email, code, password: usePassword ? password : '' }));
        toast.success('Login realizado! Seus ingressos carregados.');
        const hasHash = (data.orders || []).some((o: any) => !!o.buyerPasswordHash);
        setShowSetPassword(!hasHash);
      }
    } catch {
      toast.error('Erro');
    } finally {
      setLoading(false);
    }
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
    if (!res.ok) {
      toast.error(data.error || 'Não foi possível solicitar');
    } else {
      toast.success('Solicitação enviada! Aguarde análise do organizador.');
      lookup(); // refresh
    }
  }

  const canCancel = (order: Order) => {
    if (order.status !== 'paid') return false;
    if (order.cancellationRequests.some(cr => cr.status === 'pending' || cr.status === 'approved')) return false;
    // Client side rule hint; real validation on backend
    return true;
  };

  return (
    <div>
      {/* Banner */}
      <div className="h-44 -mx-6 mb-8 bg-gradient-to-br from-zinc-900 to-black relative flex items-center border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] bg-[length:3px_3px]" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-white">
          <div className="uppercase text-emerald-400 text-xs tracking-[3px] mb-1">Lorde Nelson</div>
          <h1 className="text-5xl font-semibold tracking-tighter">Meus Ingressos</h1>
          <p className="mt-2 text-zinc-400 max-w-md">Acesse seus ingressos, baixe o QR ou solicite cancelamento.</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pb-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-semibold tracking-tight mb-2">Acesse seus ingressos</h2>
          <p className="text-zinc-400 text-sm">Escolha como prefere entrar</p>
        </div>

        {/* Duas opções claras e intuitivas (estilo Sympla + Ingresso.com) */}
        <div className="space-y-6 mb-8">
          {/* Opção 1: Com senha (recomendado para quem já usou) */}
          <div className="card p-6 border border-emerald-900/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-600/10 rounded-xl">
                <Mail className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-semibold">Entrar com e-mail ou CPF + senha</div>
                <div className="text-xs text-emerald-400">Mais rápido nas próximas vezes</div>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                className="input"
                placeholder="seu@email.com ou 123.456.789-00"
                value={email}
                onChange={e => {
                  const val = e.target.value;
                  const digits = cleanDigits(val);
                  if (digits.length > 0 && digits.length <= 11 && /^[0-9.\- ]*$/.test(val)) {
                    setEmail(formatCpf(val));
                  } else {
                    setEmail(val);
                  }
                }}
              />
              <input 
                type="password" 
                className="input" 
                placeholder="Sua senha" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && lookup(true)} 
              />
              <button 
                onClick={() => lookup(true)} 
                disabled={loading || !email || !password} 
                className="btn btn-primary w-full py-3"
              >
                {loading ? 'Entrando...' : 'Acessar meus ingressos'}
              </button>
            </div>
            <p className="text-center text-[11px] text-zinc-500 mt-3">Use a senha que você definiu na primeira compra</p>
          </div>

          {/* Opção 2: Com código (simples para todos) */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white/5 rounded-xl">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold">Acessar com código de acesso</div>
                <div className="text-xs text-zinc-500">Recebido por e-mail</div>
              </div>
            </div>

            <div className="flex gap-3">
              <input 
                className="input font-mono tracking-[4px] text-center flex-1" 
                placeholder="LN-XXXXXX" 
                value={code} 
                onChange={e => setCode(e.target.value.toUpperCase())} 
                onKeyDown={e => e.key === 'Enter' && lookup()} 
                maxLength={9}
              />
              <button 
                onClick={() => lookup()} 
                disabled={loading || !code} 
                className="btn btn-secondary px-6"
              >
                {loading ? '...' : 'Acessar'}
              </button>
            </div>
            <p className="text-center text-[11px] text-zinc-500 mt-3">Use o código se ainda não criou uma senha</p>
          </div>
        </div>

        {justPaid && (
          <div className="mb-6 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 text-sm text-emerald-100 max-w-lg mx-auto">
            <p className="font-medium">Compra confirmada</p>
            <p className="text-xs text-emerald-200/80 mt-1">
              Não é obrigatório criar senha no checkout. Use o <strong>código de acesso</strong> (aba ao lado)
              ou o e-mail + código. Depois de ver os ingressos, você pode <strong>criar uma senha</strong> na
              caixa verde abaixo.
            </p>
            {code && (
              <p className="mt-2 font-mono text-base tracking-wider text-white">
                Seu código: <span className="text-emerald-400">{code}</span>
              </p>
            )}
          </div>
        )}

        <div className="text-center text-xs text-zinc-500 max-w-xs mx-auto">
          Primeira vez? Use o <strong>código de acesso</strong> (aba Código). Depois você pode criar uma
          senha para acessar só com e-mail/CPF. O e-mail automático depende do Resend (domínio verificado).
        </div>

        {orders.length > 0 && (
          <div className="flex items-center justify-between mb-4 text-sm bg-zinc-900/70 border border-white/10 px-4 py-2.5 rounded-2xl">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
              <span className="text-zinc-300">Logado como <span className="font-medium text-white">{email || 'convidado'}</span></span>
            </div>
            <button 
              onClick={() => { localStorage.removeItem('clientSession'); window.location.reload(); }} 
              className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs font-medium"
            >
              <LogOut size={14} /> Sair
            </button>
          </div>
        )}

      {/* Set password - shown nicely after first access */}
      {showSetPassword && orders.length > 0 && (
        <div className="mb-8 p-5 bg-zinc-900 border border-emerald-900/30 rounded-2xl">
          <div className="flex items-start gap-3 mb-3">
            <div className="mt-0.5">
              <Lock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1">
              <div className="font-medium">Crie uma senha para acessar mais rápido</div>
              <div className="text-sm text-zinc-400 mt-0.5">Na próxima vez você só precisa do seu e-mail/CPF + essa senha. Sem precisar do código.</div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <input 
              type="password" 
              className="input flex-1" 
              placeholder="Escolha uma senha" 
              value={newPassword} 
              onChange={e => setNewPassword(e.target.value)} 
            />
            <button
              onClick={async () => {
                if (!newPassword) return toast.error('Preencha a nova senha');
                const cleaned = cleanDigits(email);
                const payload: any = { password: newPassword };
                if (code) payload.code = code;
                if (cleaned.length === 11) {
                  payload.cpf = cleaned;
                } else if (email) {
                  payload.email = email;
                }
                const res = await fetch('/api/orders/lookup', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                if (res.ok) {
                  toast.success('Senha salva! Use e-mail/CPF + senha na próxima vez.');
                  setShowSetPassword(false);
                  setPassword(newPassword);
                  lookup(true);
                } else {
                  toast.error('Não foi possível definir a senha. Tente novamente.');
                }
              }}
              className="btn btn-primary px-6"
            >
              Salvar senha
            </button>
          </div>
        </div>
      )}

      {searched && orders.length === 0 && (
        <div className="text-center py-12">
          <div className="mx-auto w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
            <KeyRound className="w-5 h-5 text-zinc-500" />
          </div>
          <div className="text-lg font-medium mb-1">Nenhum ingresso encontrado</div>
          <div className="text-sm text-zinc-500 max-w-xs mx-auto">Verifique se o e-mail/CPF ou código estão corretos.</div>
        </div>
      )}

      {orders.map(order => (
        <div key={order.id} className="card mb-6 overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-y-3">
            <div>
              <div className="font-semibold text-lg tracking-tight">{order.event.title}</div>
              <div className="text-sm text-zinc-400 flex items-center gap-2 mt-0.5">
                {formatDate(order.event.date)}
                <span className="text-zinc-600">•</span>
                {order.event.address}
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium">{formatPrice(order.totalCents)}</div>
              <div className={`text-xs font-medium uppercase tracking-wider ${order.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {order.status === 'paid' ? 'Pago' : order.status}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-3">
            {order.tickets.map(t => (
              <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/60 rounded-xl p-4">
                <div>
                  <div className="font-medium">{t.ticketType.name}</div>
                  <div className="font-mono text-sm text-emerald-400 mt-0.5">{t.uniqueCode}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => downloadPDF(t.id)} 
                    className="btn btn-secondary text-sm px-4 py-2 flex items-center gap-2"
                  >
                    <Download size={15} /> PDF
                  </button>
                  <button 
                    onClick={() => setPreviewTicket({ code: t.uniqueCode, payload: t.uniqueCode, name: order.buyerName, event: order.event.title })} 
                    className="btn btn-secondary text-sm px-4 py-2 flex items-center gap-2"
                  >
                    <QrCode size={15} /> Ver QR
                  </button>
                  {t.status === 'valid' && order.status === 'paid' && (
                    <button 
                      onClick={() => requestCancel(order)} 
                      disabled={!canCancel(order)} 
                      className="btn text-sm px-4 py-2 text-red-400 hover:bg-red-950/30 border-red-900/40"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {order.cancellationRequests.length > 0 && (
            <div className="px-6 py-3 text-xs bg-amber-950/30 text-amber-300 border-t border-white/10">
              Cancelamento: {order.cancellationRequests[0].status} — {order.cancellationRequests[0].reason}
            </div>
          )}
        </div>
      ))}

      <div className="text-center text-[11px] text-zinc-500 max-w-sm mx-auto">
        Regras de cancelamento: definidas pelo organizador no Admin. Estornos (quando aprovados) são processados automaticamente pelo Stripe ou Mercado Pago.
      </div>

      {/* Ticket QR Preview Modal - clean & app-like */}
      {previewTicket && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setPreviewTicket(null)}>
          <div className="bg-zinc-950 border border-white/10 rounded-3xl max-w-xs w-full p-6 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="uppercase tracking-[2px] text-emerald-400 text-xs mb-3">Apresente na entrada</div>
            
            <div className="mx-auto w-60 bg-white p-5 rounded-2xl mb-5">
              <QRCode value={previewTicket.payload} size={210} />
            </div>

            <div className="font-semibold text-xl mb-1 tracking-tight text-white">{previewTicket.event}</div>
            <div className="font-mono text-2xl text-emerald-400 tracking-[4px] mb-1">{previewTicket.code}</div>
            <div className="text-zinc-400">{previewTicket.name}</div>

            <button 
              onClick={() => setPreviewTicket(null)} 
              className="mt-7 w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-sm border border-white/10"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
      </div> {/* close max-w content */}
    </div>
  );
}
