'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/utils';
import { toast } from 'sonner';
import { loadStripe, Stripe, type StripeElements } from '@stripe/stripe-js';
import { formatCpf, isValidCpf, formatPhone, isValidPhone, cleanCpf, cleanPhone } from '@/lib/masks';

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
  const [buyer, setBuyer] = useState({ name: '', email: '', cpf: '', phone: '' });

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

  const orderId = params.orderId;

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

  const isFormValid = basicValid && selectedMethod;

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
          setPaymentStatus('paid');
          setPaymentStatusMsg('Pagamento confirmado! Redirecionando…');
          toast.success('PIX confirmado! Seus ingressos estão prontos.');
          const email = buyer.email || data.buyerEmail || '';
          const code = data.accessCode || pixData.accessCode || '';
          setTimeout(() => {
            router.push(
              `/ingressos?email=${encodeURIComponent(email)}${code ? `&code=${code}` : ''}&success=1`
            );
          }, 800);
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
      // Load publishable key from configurable settings (fallback to env)
      let pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
      try {
        const res = await fetch('/api/admin/settings');
        if (res.ok) {
          const s = await res.json();
          if (s.stripe_publishable_key) pubKey = s.stripe_publishable_key;
        }
      } catch {}
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
      }
      return;
    }

    setProcessing(true);

    // Send cleaned values to API (good for storage + gateways)
    const buyerPayload = {
      name: buyer.name.trim(),
      email: buyer.email.trim(),
      cpf: cleanedCpf,
      phone: buyer.phone ? cleanPhone(buyer.phone) : '',
    };

    try {
      const gateway = selectedMethod === 'pix' ? 'mercadopago' : 'stripe';
      const method = selectedMethod;

      const res = await fetch('/api/orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, buyer: buyerPayload, gateway, method }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');

      if (data.type === 'pix' && data.qr_code) {
        setPixData(data);
        setPaymentStatus('waiting');
        toast.success('QR gerado. Código de acesso: ' + (data.accessCode || ''));
      } else if (data.type === 'stripe' && data.clientSecret) {
        setClientSecret(data.clientSecret);
        toast.info('Cartão. Guarde código: ' + (data.accessCode || ''));

        // Initialize Stripe Elements (works for both direct keys and Connect account)
        if (stripe && data.clientSecret) {
          const el = stripe.elements({ clientSecret: data.clientSecret });
          setElements(el);

          const paymentElement = el.create('payment');
          // Mount after render
          setTimeout(() => {
            const mountEl = document.getElementById('stripe-payment-element');
            if (mountEl) paymentElement.mount('#stripe-payment-element');
          }, 100);
        }
      } else if (data.type === 'simulated') {
        toast.success(data.message || 'Pagamento confirmado');
        const q = data.accessCode ? `?email=${encodeURIComponent(buyer.email)}&code=${data.accessCode}` : `?email=${encodeURIComponent(buyer.email)}`;
        router.push(`/ingressos${q}`);
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

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/ingressos?email=${encodeURIComponent(buyer.email)}&success=1`,
      },
      redirect: 'always',
    });

    if (error) {
      toast.error(error.message || 'Erro ao confirmar cartão');
      setProcessing(false);
    } else {
      // Se não redirecionou, assumimos sucesso (webhook deve atualizar)
      toast.success('Pagamento processado! Verifique seus ingressos.');
      setTimeout(() => {
        router.push(`/ingressos?email=${encodeURIComponent(buyer.email)}&success=1`);
      }, 1200);
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
          <button
            onClick={() => {
              if (!basicValid) {
                toast.error('Preencha nome, e-mail válido e CPF antes de escolher PIX');
                return;
              }
              setSelectedMethod('pix'); setPixData(null); setClientSecret(null);
            }}
            className={`card p-5 text-left border ${selectedMethod === 'pix' ? 'border-emerald-500' : 'border-white/10'} ${!basicValid ? 'opacity-60' : ''}`}
          >
            <div className="font-semibold">PIX (Mercado Pago)</div>
            <div className="text-xs text-emerald-400 mt-1">Aprovação instantânea • Mais rápido</div>
          </button>

          <button
            onClick={selectCard}
            className={`card p-5 text-left border ${selectedMethod === 'card' ? 'border-emerald-500' : 'border-white/10'} ${!basicValid ? 'opacity-60' : ''}`}
          >
            <div className="font-semibold">Cartão / Boleto (Stripe)</div>
            <div className="text-xs text-zinc-400 mt-1">Métodos disponíveis na conta Stripe (incluindo via Connect OAuth)</div>
          </button>
        </div>

        <button
          onClick={initiatePayment}
          disabled={processing || !isFormValid}
          title={!isFormValid ? 'Preencha todos os dados obrigatórios e escolha uma forma de pagamento' : undefined}
          className="btn btn-primary w-full text-base py-4 disabled:opacity-60"
        >
          {processing ? 'Processando...' : selectedMethod === 'pix' ? 'Gerar QR Code Pix' : selectedMethod === 'card' ? 'Carregar formulário de Cartão' : 'Preencha os dados e escolha o pagamento'}
        </button>
      </div>

      {/* PIX Result */}
      {pixData && (
        <div className="card p-6 mb-6 border-emerald-900/50">
          <div className="text-emerald-400 text-sm mb-2">Pague com PIX</div>
          
          {pixData.qr_code_base64 && (
            <img 
              src={`data:image/png;base64,${pixData.qr_code_base64}`} 
              className="mx-auto w-56 h-56 mb-4 bg-white p-3 rounded" 
              alt="QR Code Pix" 
            />
          )}

          {pixData.qr_code && (
            <div className="mb-4">
              <div className="text-xs mb-1 text-zinc-400">Código copia e cola:</div>
              <code className="block p-3 bg-zinc-950 text-xs break-all rounded border border-white/10 select-all">{pixData.qr_code}</code>
            </div>
          )}

          <div
            className={`mt-4 p-3 rounded-xl text-sm border ${
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
              <span>{paymentStatusMsg || 'Aguardando confirmação do PIX…'}</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5">
              Confirmação automática via webhook + verificação a cada 3s no Mercado Pago. Não precisa fazer nada após pagar.
            </p>
          </div>

          {pixData.accessCode && (
            <div className="mt-3 p-3 bg-zinc-950 border border-emerald-900 rounded font-mono text-emerald-400 text-center text-lg tracking-widest">{pixData.accessCode}</div>
          )}
          
          <button 
            onClick={() => router.push(`/ingressos?email=${encodeURIComponent(buyer.email)}&code=${pixData.accessCode || ''}`)} 
            className="btn btn-secondary w-full mt-4"
            disabled={paymentStatus === 'waiting'}
          >
            {paymentStatus === 'paid' ? 'Ver meus ingressos' : 'Ver ingressos com código (se já pagou)'}
          </button>
        </div>
      )}

      {/* Stripe Card Form */}
      {clientSecret && (
        <div className="card p-6 mb-6">
          <div className="mb-4 text-sm">Pagamento com cartão via Stripe (ambiente seguro)</div>
          
          <div id="stripe-payment-element" className="mb-6 min-h-[120px] bg-zinc-950 rounded-xl p-4 border border-white/10" />

          <button 
            onClick={confirmStripePayment} 
            disabled={processing} 
            className="btn btn-primary w-full text-base"
          >
            {processing ? 'Confirmando pagamento...' : 'Confirmar Pagamento com Cartão'}
          </button>

          <p className="text-[10px] text-center mt-3 text-zinc-500">Seus dados de cartão são processados diretamente pelo Stripe (nunca passam pelo nosso servidor).</p>
        </div>
      )}

      <div className="text-xs text-center text-zinc-500 mt-8">
        Ambiente seguro. Webhooks garantem a atualização automática do status.
        <br />PIX MP: use chaves TEST-... para localhost. Para produção configure "URL Pública" + ngrok em Admin &gt; Configurações &gt; Gateways.
      </div>
    </div>
  );
}
