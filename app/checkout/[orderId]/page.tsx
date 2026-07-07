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

  // Stripe
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const orderId = params.orderId;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) throw new Error('Pedido não encontrado');
        const data = await res.json();
        setOrder(data);
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

  // Load Stripe when card method selected
  async function selectCard() {
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
    if (!buyer.name.trim() || !buyer.email.trim()) {
      toast.error('Preencha nome e e-mail');
      return;
    }

    const cleanedCpf = cleanCpf(buyer.cpf);
    if (!cleanedCpf || !isValidCpf(cleanedCpf)) {
      toast.error('Informe um CPF válido');
      return;
    }

    if (buyer.phone) {
      const cleanedPhone = cleanPhone(buyer.phone);
      if (!isValidPhone(cleanedPhone)) {
        toast.error('Telefone inválido (use DDD + número)');
        return;
      }
    }

    if (!selectedMethod) {
      toast.error('Escolha PIX ou Cartão');
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
        toast.success('QR gerado. Código de acesso: ' + (data.accessCode || ''));
      } else if (data.type === 'stripe' && data.clientSecret) {
        setClientSecret(data.clientSecret);
        toast.info('Cartão. Guarde código: ' + (data.accessCode || ''));

        // Initialize Stripe Elements
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
        <div className="label mb-2">Seus dados (obrigatório • CPF obrigatório para emissão)</div>
        <input className="input mb-3" placeholder="Nome completo *" value={buyer.name} onChange={e => setBuyer({ ...buyer, name: e.target.value })} />
        <input className="input mb-3" type="email" placeholder="E-mail *" value={buyer.email} onChange={e => setBuyer({ ...buyer, email: e.target.value })} />
        <input
          className="input mb-3"
          placeholder="CPF *"
          value={buyer.cpf}
          onChange={e => setBuyer({ ...buyer, cpf: formatCpf(e.target.value) })}
          maxLength={14}
        />
        <input
          className="input"
          placeholder="Telefone (com DDD)"
          value={buyer.phone}
          onChange={e => setBuyer({ ...buyer, phone: formatPhone(e.target.value) })}
          maxLength={15}
        />
      </div>

      {/* Payment methods */}
      <div className="mb-6">
        <div className="label mb-3">Forma de pagamento</div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <button
            onClick={() => { setSelectedMethod('pix'); setPixData(null); setClientSecret(null); }}
            className={`card p-5 text-left border ${selectedMethod === 'pix' ? 'border-emerald-500' : 'border-white/10'}`}
          >
            <div className="font-semibold">PIX (Mercado Pago)</div>
            <div className="text-xs text-emerald-400 mt-1">Aprovação instantânea • Mais rápido</div>
          </button>

          <button
            onClick={selectCard}
            className={`card p-5 text-left border ${selectedMethod === 'card' ? 'border-emerald-500' : 'border-white/10'}`}
          >
            <div className="font-semibold">Cartão de Crédito (Stripe)</div>
            <div className="text-xs text-zinc-400 mt-1">Checkout transparente seguro</div>
          </button>
        </div>

        <button
          onClick={initiatePayment}
          disabled={processing || !selectedMethod}
          className="btn btn-primary w-full text-base py-4 disabled:opacity-60"
        >
          {processing ? 'Processando...' : selectedMethod === 'pix' ? 'Gerar QR Code Pix' : 'Carregar formulário de Cartão'}
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

          <p className="text-xs text-zinc-400">Após o pagamento, o status será atualizado automaticamente (webhook Mercado Pago).</p>

          {pixData.accessCode && (
            <div className="mt-3 p-3 bg-zinc-950 border border-emerald-900 rounded font-mono text-emerald-400 text-center text-lg tracking-widest">{pixData.accessCode}</div>
          )}
          
          <button 
            onClick={() => router.push(`/ingressos?email=${encodeURIComponent(buyer.email)}&code=${pixData.accessCode || ''}`)} 
            className="btn btn-secondary w-full mt-4"
          >
            Ver ingressos com código
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
      </div>
    </div>
  );
}
