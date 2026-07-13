'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/utils';
import { toast } from 'sonner';
import { loadStripe, Stripe, type StripeElements } from '@stripe/stripe-js';
import { formatCpf, isValidCpf, formatPhone, isValidPhone, cleanCpf, cleanPhone } from '@/lib/masks';
import PurchaseSuccessModal, {
  type PurchaseModalVariant,
} from '@/components/PurchaseSuccessModal';

interface OrderData {
  id: string;
  totalCents: number;
  event: { title: string; date: string };
  tickets: { id: string }[];
  status: string;
}

export default function CheckoutPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyer, setBuyer] = useState({
    name: '',
    email: '',
    cpf: '',
    phone: '',
    password: '',
    password2: '',
  });
  const [wantPassword, setWantPassword] = useState(false);

  const [selectedMethod, setSelectedMethod] = useState<'pix' | 'card' | null>(null);
  const [processing, setProcessing] = useState(false);

  interface PixData {
    qr_code_base64?: string;
    qr_code?: string;
    accessCode?: string;
  }
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'waiting' | 'paid' | 'failed'>('idle');
  const [paymentStatusMsg, setPaymentStatusMsg] = useState('');

  // Stripe
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // Modal só após pagamento confirmado
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVariant, setModalVariant] = useState<PurchaseModalVariant>('paid');
  const [paidAccessCode, setPaidAccessCode] = useState('');
  const [paidTicketIds, setPaidTicketIds] = useState<string[]>([]);
  const [blockAutoRedirect, setBlockAutoRedirect] = useState(false);

  type PayMethodUi = { id: 'pix' | 'card'; label: string; hint: string; enabled: boolean };
  const [payMethods, setPayMethods] = useState<PayMethodUi[]>([
    { id: 'pix', label: 'PIX', hint: 'Aprovação na hora', enabled: true },
    { id: 'card', label: 'Cartão', hint: 'Crédito e débito', enabled: true },
  ]);

  const orderId = params.orderId;

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((s) => {
        if (!s || typeof s !== 'object') return;
        const pixOn = !['0', 'false', 'off'].includes(String(s.pay_pix_enabled ?? '1').toLowerCase());
        const cardOn = !['0', 'false', 'off'].includes(String(s.pay_card_enabled ?? '1').toLowerCase());
        setPayMethods([
          {
            id: 'pix',
            label: (s.pay_pix_label || 'PIX').trim() || 'PIX',
            hint: (s.pay_pix_hint || 'Aprovação na hora').trim(),
            enabled: pixOn,
          },
          {
            id: 'card',
            label: (s.pay_card_label || 'Cartão').trim() || 'Cartão',
            hint: (s.pay_card_hint || 'Crédito e débito').trim(),
            enabled: cardOn,
          },
        ]);
      })
      .catch(() => {});
  }, []);

  const goToIngressos = useCallback(
    (email: string, code: string) => {
      const q = new URLSearchParams();
      if (email) q.set('email', email);
      if (code) q.set('code', code);
      q.set('success', '1');
      router.push(`/ingressos?${q}`);
    },
    [router]
  );

  const cleanedCpf = cleanCpf(buyer.cpf);
  const isPhoneValid = !buyer.phone || isValidPhone(cleanPhone(buyer.phone));
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailRegex.test(buyer.email.trim());

  const basicValid =
    buyer.name.trim().length > 2 &&
    isEmailValid &&
    cleanedCpf.length === 11 &&
    isValidCpf(cleanedCpf) &&
    isPhoneValid;

  const passwordOk =
    !wantPassword ||
    (buyer.password.length >= 6 && buyer.password === buyer.password2);

  const isFormValid = basicValid && selectedMethod && passwordOk;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) throw new Error('Pedido não encontrado');
        const data = await res.json();
        setOrder(data);
        if (data.status === 'paid') {
          router.replace(
            `/ingressos?email=${encodeURIComponent(data.buyerEmail || '')}${data.accessCode ? `&code=${data.accessCode}` : ''}&success=1`
          );
          return;
        }
        if (data.status !== 'pending') {
          router.replace(`/ingressos?email=${encodeURIComponent(data.buyerEmail || '')}`);
        }
      } catch {
        toast.error('Pedido inválido ou expirado');
        router.push('/eventos');
      } finally {
        setLoading(false);
      }
    }
    if (orderId) load();
  }, [orderId, router]);

  // Polling em tempo real do PIX (webhook + consulta MP)
  useEffect(() => {
    if (!pixData || !orderId || paymentStatus === 'paid') return;

    setPaymentStatus('waiting');
    setPaymentStatusMsg('Aguardando confirmação do PIX…');

    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/payment-status`, { cache: 'no-store' });
        if (!res.ok || stopped) return;
        const data = await res.json();
        if (data.status === 'paid') {
          const email = buyer.email || data.buyerEmail || '';
          const code = data.accessCode || pixData.accessCode || '';
          if (data.accessCode) {
            setPixData((prev) => (prev ? { ...prev, accessCode: data.accessCode } : prev));
          }
          setPaymentStatus('paid');
          setPaidAccessCode(code);
          if (Array.isArray(data.ticketIds)) setPaidTicketIds(data.ticketIds);
          setPaymentStatusMsg('Pagamento confirmado!');
          toast.success('Pagamento confirmado!');
          setModalVariant('paid');
          setModalOpen(true);
          setBlockAutoRedirect(true);
          return;
        }
        if (data.mpStatus && ['rejected', 'cancelled', 'canceled', 'expired'].includes(data.mpStatus)) {
          setPaymentStatus('failed');
          setPaymentStatusMsg('Pagamento não aprovado. Gere um novo PIX ou escolha outro método.');
          return;
        }
        setPaymentStatusMsg(data.message || 'Aguardando pagamento PIX…');
      } catch {
        /* rede — tenta de novo */
      }
    };

    tick();
    const id = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [pixData, orderId, paymentStatus, buyer.email, router]);

  // Load Stripe when card method selected
  async function selectCard() {
    if (!basicValid) {
      toast.error('Preencha nome, e-mail válido e CPF antes de escolher a forma de pagamento');
      return;
    }
    setSelectedMethod('card');
    setPixData(null);

    if (!stripe) {
      let pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
      try {
        const res = await fetch('/api/admin/settings');
        if (res.ok) {
          const s = await res.json();
          if (s.stripe_publishable_key) pubKey = s.stripe_publishable_key;
        }
      } catch {
        /* ignore */
      }
      if (!pubKey) {
        toast.error('Pagamento com cartão indisponível no momento');
        return;
      }
      const s = await loadStripe(pubKey);
      if (s) setStripe(s);
    }
  }

  async function initiatePayment() {
    if (!isFormValid) {
      if (!buyer.name.trim() || !isEmailValid) {
        toast.error('Preencha nome completo e um e-mail válido');
      } else if (!cleanedCpf || !isValidCpf(cleanedCpf)) {
        toast.error('Informe um CPF válido (11 dígitos)');
      } else if (buyer.phone && !isValidPhone(cleanPhone(buyer.phone))) {
        toast.error('Telefone inválido (use DDD + número)');
      } else if (!selectedMethod) {
        toast.error('Escolha PIX ou Cartão');
      } else if (wantPassword && buyer.password.length < 6) {
        toast.error('Senha com no mínimo 6 caracteres (ou desmarque criar senha)');
      } else if (wantPassword && buyer.password !== buyer.password2) {
        toast.error('As senhas não coincidem');
      }
      return;
    }

    setProcessing(true);

    // Send cleaned values to API (good for storage + gateways)
    const buyerPayload: Record<string, string> = {
      name: buyer.name.trim(),
      email: buyer.email.trim(),
      cpf: cleanedCpf,
      phone: buyer.phone ? cleanPhone(buyer.phone) : '',
    };
    if (wantPassword && buyer.password.length >= 6) {
      buyerPayload.password = buyer.password;
    }

    try {
      const method = selectedMethod;

      const res = await fetch('/api/orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, buyer: buyerPayload, method }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');

      if (data.type === 'pix' && data.qr_code) {
        // accessCode fica só no state interno — não destacar até pagar
        setPixData({
          qr_code: data.qr_code,
          qr_code_base64: data.qr_code_base64,
          accessCode: data.accessCode,
        });
        setPaymentStatus('waiting');
        if (data.accessCode) setPaidAccessCode(data.accessCode);
        toast.success('PIX gerado — pague com o QR ou copia e cola');
        // sem modal de “código de acesso” antes do pagamento
      } else if (data.type === 'stripe' && data.clientSecret) {
        setClientSecret(data.clientSecret);
        if (data.accessCode) {
          setPaidAccessCode(data.accessCode);
          try {
            sessionStorage.setItem(`orderCode-${orderId}`, data.accessCode);
          } catch {
            /* ignore */
          }
        }
        toast.info('Preencha os dados do cartão abaixo');

        if (stripe && data.clientSecret) {
          const el = stripe.elements({ clientSecret: data.clientSecret });
          setElements(el);

          const paymentElement = el.create('payment');
          setTimeout(() => {
            const mountEl = document.getElementById('stripe-payment-element');
            if (mountEl) paymentElement.mount('#stripe-payment-element');
          }, 100);
        }
      } else if (data.type === 'simulated') {
        const code = data.accessCode || '';
        setPaidAccessCode(code);
        if (Array.isArray(data.ticketIds)) setPaidTicketIds(data.ticketIds);
        setModalVariant('paid');
        setModalOpen(true);
        toast.success(data.message || 'Pagamento confirmado');
      }
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Falha no pagamento');
    } finally {
      setProcessing(false);
    }
  }

  async function confirmStripePayment() {
    if (!stripe || !elements || !clientSecret) return;

    setProcessing(true);

    let code = paidAccessCode;
    try {
      code = code || sessionStorage.getItem(`orderCode-${orderId}`) || '';
    } catch {}
    const codeQ = code ? `&code=${encodeURIComponent(code)}` : '';
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/ingressos?email=${encodeURIComponent(buyer.email)}${codeQ}&success=1`,
      },
      redirect: 'always',
    });

    if (error) {
      toast.error(error.message || 'Erro ao confirmar cartão');
      setProcessing(false);
    } else {
      // Se não redirecionou, modal + ir para Meus Ingressos com código
      setModalVariant('paid');
      setModalOpen(true);
      toast.success('Pagamento processado!');
    }
  }

  if (loading || !order) return <div className="p-12 text-center text-zinc-400">Carregando checkout seguro...</div>;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Finalizar Compra</h1>
      <p className="text-zinc-400 mb-6">Pedido #{order.id.slice(0, 8)} • {order.event.title} • {formatPrice(order.totalCents)}</p>

      {/* Buyer form */}
      <div className="card p-6 mb-6">
        <div className="label mb-2">Seus dados (obrigatório • CPF obrigatório para PIX e emissão)</div>
        <input 
          className={`input mb-1 ${!buyer.name.trim() ? 'border-red-500 focus:ring-red-500/30' : ''}`} 
          placeholder="Nome completo *" 
          value={buyer.name} 
          onChange={e => setBuyer({ ...buyer, name: e.target.value })} 
        />
        {!buyer.name.trim() && <div className="text-[10px] text-red-400 mb-2">Nome completo é obrigatório.</div>}

        <input 
          className={`input mb-1 ${buyer.email.trim() && !isEmailValid ? 'border-red-500 focus:ring-red-500/30' : ''}`} 
          type="email" 
          placeholder="E-mail *" 
          value={buyer.email} 
          onChange={e => setBuyer({ ...buyer, email: e.target.value })} 
        />
        {buyer.email.trim() && !isEmailValid && <div className="text-[10px] text-red-400 mb-2">Informe um e-mail válido.</div>}

        <input
          className={`input mb-1 ${cleanedCpf && !isValidCpf(cleanedCpf) ? 'border-red-500 focus:ring-red-500/30' : ''}`}
          placeholder="CPF * (obrigatório)"
          value={buyer.cpf}
          onChange={e => setBuyer({ ...buyer, cpf: formatCpf(e.target.value) })}
          maxLength={14}
        />
        {cleanedCpf && !isValidCpf(cleanedCpf) && <div className="text-[10px] text-red-400 mb-2">CPF inválido. Use os 11 dígitos.</div>}

        <input
          className={`input ${buyer.phone && !isPhoneValid ? 'border-red-500 focus:ring-red-500/30' : ''}`}
          placeholder="Telefone (com DDD) - opcional"
          value={buyer.phone}
          onChange={e => setBuyer({ ...buyer, phone: formatPhone(e.target.value) })}
          maxLength={15}
        />
        {buyer.phone && !isPhoneValid && <div className="text-[10px] text-red-400 mt-1">Telefone deve ter 10 ou 11 dígitos (com DDD).</div>}

        {/* Cadastro opcional de senha na compra */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 rounded border-white/20"
              checked={wantPassword}
              onChange={(e) => {
                setWantPassword(e.target.checked);
                if (!e.target.checked) setBuyer((b) => ({ ...b, password: '', password2: '' }));
              }}
            />
            <span>
              <span className="text-sm font-medium text-zinc-200">Criar senha (opcional)</span>
              <span className="block text-[11px] text-zinc-500 mt-0.5">
                Depois acessa Meus Ingressos com e-mail/CPF + senha, sem o código LN-…. Pode pular e
                usar só o código.
              </span>
            </span>
          </label>
          {wantPassword && (
            <div className="mt-3 space-y-2">
              <input
                type="password"
                className="input"
                placeholder="Senha (mín. 6 caracteres)"
                value={buyer.password}
                onChange={(e) => setBuyer({ ...buyer, password: e.target.value })}
                autoComplete="new-password"
              />
              <input
                type="password"
                className={`input ${
                  buyer.password2 && buyer.password !== buyer.password2
                    ? 'border-red-500 focus:ring-red-500/30'
                    : ''
                }`}
                placeholder="Confirmar senha"
                value={buyer.password2}
                onChange={(e) => setBuyer({ ...buyer, password2: e.target.value })}
                autoComplete="new-password"
              />
              {buyer.password2 && buyer.password !== buyer.password2 && (
                <div className="text-[10px] text-red-400">As senhas não coincidem.</div>
              )}
            </div>
          )}
        </div>

        <div className="text-[10px] text-zinc-400 mt-2">* Campos obrigatórios. CPF é exigido para PIX e emissão do ingresso.</div>
      </div>

      {/* Payment methods */}
      <div className="mb-6">
        <div className="label mb-3">Forma de pagamento</div>
        {!basicValid && (
          <div className="mb-3 text-sm text-amber-400 bg-amber-950/40 border border-amber-900/50 rounded px-3 py-2">
            Preencha nome completo, e-mail válido e CPF acima para habilitar as opções de pagamento.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {payMethods
            .filter((m) => m.enabled)
            .map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (!basicValid) {
                    toast.error('Preencha nome, e-mail válido e CPF antes de escolher o pagamento');
                    return;
                  }
                  if (m.id === 'card') {
                    selectCard();
                    return;
                  }
                  setSelectedMethod('pix');
                  setPixData(null);
                  setClientSecret(null);
                }}
                className={`card p-5 text-left border ${
                  selectedMethod === m.id ? 'border-emerald-500' : 'border-white/10'
                } ${!basicValid ? 'opacity-60' : ''}`}
              >
                <div className="font-semibold">{m.label}</div>
                {m.hint ? (
                  <div
                    className={`text-xs mt-1 ${
                      m.id === 'pix' ? 'text-emerald-400' : 'text-zinc-400'
                    }`}
                  >
                    {m.hint}
                  </div>
                ) : null}
              </button>
            ))}
        </div>

        <button
          onClick={initiatePayment}
          disabled={processing || !isFormValid}
          title={
            !isFormValid
              ? 'Preencha todos os dados obrigatórios e escolha uma forma de pagamento'
              : undefined
          }
          className="btn btn-primary w-full text-base py-4 disabled:opacity-60"
        >
          {processing
            ? 'Processando...'
            : selectedMethod === 'pix'
              ? 'Gerar PIX'
              : selectedMethod === 'card'
                ? 'Continuar com cartão'
                : 'Preencha os dados e escolha o pagamento'}
        </button>
      </div>

      {/* PIX Result — só QR + copia e cola do PIX (sem código de acesso) */}
      {pixData && (
        <div id="pix-qr-area" className="card p-6 mb-6 border-emerald-900/50">
          <div className="text-emerald-400 text-sm mb-2 font-medium">Pague com PIX</div>

          {pixData.qr_code_base64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${pixData.qr_code_base64}`}
              className="mx-auto w-56 h-56 mb-4 bg-white p-3 rounded"
              alt="QR Code PIX"
            />
          )}

          {pixData.qr_code && (
            <div className="mb-4">
              <div className="text-xs mb-1 text-zinc-400">PIX copia e cola</div>
              <code className="block p-3 bg-zinc-950 text-xs break-all rounded border border-white/10 select-all">
                {pixData.qr_code}
              </code>
              <button
                type="button"
                className="btn btn-primary w-full mt-3 text-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pixData.qr_code || '');
                    toast.success('Código PIX copiado!');
                  } catch {
                    toast.message('Selecione e copie o código PIX acima');
                  }
                }}
              >
                Copiar código PIX
              </button>
            </div>
          )}

          <div
            className={`mt-2 p-3 rounded-xl text-sm border ${
              paymentStatus === 'paid'
                ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                : paymentStatus === 'failed'
                  ? 'border-red-500/40 bg-red-950/30 text-red-300'
                  : 'border-white/10 bg-zinc-950/60 text-zinc-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {paymentStatus === 'waiting' && (
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
              {paymentStatus === 'paid' && <span className="text-emerald-400">✓</span>}
              <span>
                {paymentStatusMsg ||
                  'Aguardando pagamento… A confirmação é automática após pagar.'}
              </span>
            </div>
          </div>

          {paymentStatus === 'paid' && (
            <button
              type="button"
              onClick={() =>
                goToIngressos(buyer.email, paidAccessCode || pixData.accessCode || '')
              }
              className="btn btn-primary w-full mt-4"
            >
              Ver meus ingressos
            </button>
          )}
        </div>
      )}

      {/* Card form */}
      {clientSecret && (
        <div className="card p-6 mb-6">
          <div className="mb-4 text-sm text-zinc-300">Dados do cartão</div>

          <div
            id="stripe-payment-element"
            className="mb-6 min-h-[120px] bg-zinc-950 rounded-xl p-4 border border-white/10"
          />

          <button
            onClick={confirmStripePayment}
            disabled={processing}
            className="btn btn-primary w-full text-base"
          >
            {processing ? 'Confirmando…' : 'Pagar com cartão'}
          </button>

          <p className="text-[10px] text-center mt-3 text-zinc-500">
            Pagamento processado de forma segura. Não armazenamos os dados do cartão.
          </p>
        </div>
      )}

      <div className="text-xs text-center text-zinc-500 mt-8">
        Ambiente seguro. Após o pagamento, o ingresso é enviado por e-mail.
      </div>

      <PurchaseSuccessModal
        open={modalOpen}
        onClose={() => {
          // Fechar (X, overlay, Esc) → Meus Ingressos com e-mail + código
          const email = buyer.email || '';
          const code = paidAccessCode || pixData?.accessCode || '';
          setModalOpen(false);
          setBlockAutoRedirect(false);
          goToIngressos(email, code);
        }}
        variant={modalVariant}
        accessCode={paymentStatus === 'paid' || modalVariant === 'paid' ? paidAccessCode || pixData?.accessCode || '' : ''}
        email={buyer.email}
        eventTitle={order?.event?.title}
        ticketIds={paidTicketIds}
        orderAccessCode={paidAccessCode || pixData?.accessCode || ''}
        autoRedirectSec={modalVariant === 'paid' ? 12 : 0}
        primaryLabel="Ver meus ingressos"
        onPrimary={() => {
          const email = buyer.email || '';
          const code = paidAccessCode || pixData?.accessCode || '';
          setModalOpen(false);
          goToIngressos(email, code);
        }}
        secondaryLabel={modalVariant === 'paid' ? 'Ir para Meus Ingressos' : undefined}
        onSecondary={
          modalVariant === 'paid'
            ? () => {
                const email = buyer.email || '';
                const code = paidAccessCode || pixData?.accessCode || '';
                setModalOpen(false);
                setBlockAutoRedirect(false);
                goToIngressos(email, code);
              }
            : undefined
        }
      />
    </div>
  );
}
