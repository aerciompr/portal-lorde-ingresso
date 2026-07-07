import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { sendOrderConfirmation } from '@/lib/email';
import { signCode } from '@/lib/validate-ticket';
import { getFeeForMethod, getAppSettings } from '@/lib/settings';
import { isValidCpf, isValidPhone, cleanCpf, cleanPhone } from '@/lib/masks';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Load keys preferring DB settings (configurable in admin) over .env
async function getPaymentClients() {
  const s = await getAppSettings();
  const STRIPE_SECRET = s.payment.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '';
  const MP_ACCESS_TOKEN = s.payment.mpAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
  const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;
  const mpClient = MP_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN }) : null;
  return { stripe, mpClient, STRIPE_SECRET, MP_ACCESS_TOKEN };
}

export async function POST(req: NextRequest) {
  try {
    const { orderId, buyer, gateway, method } = await req.json();

    const s = await getAppSettings();
    const { stripe, mpClient } = await getPaymentClients();
    const STRIPE_PUBLISHABLE = s.payment.stripePublishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '';

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { tickets: true, event: true },
    });

    if (!order || order.status !== 'pending') {
      return NextResponse.json({ error: 'Pedido inválido ou já processado' }, { status: 400 });
    }

    // Server-side validation for CPF and phone (masks already applied on client)
    const cleanedCpf = cleanCpf(buyer?.cpf || '');
    if (!cleanedCpf || !isValidCpf(cleanedCpf)) {
      return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });
    }

    if (buyer?.phone) {
      const cleanedPhone = cleanPhone(buyer.phone);
      if (!isValidPhone(cleanedPhone)) {
        return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 });
      }
    }

    const accessCode = 'LN-' + Math.random().toString(36).slice(2, 8).toUpperCase();

    const finalCpf = cleanCpf(buyer.cpf || '');
    const finalPhone = buyer.phone ? cleanPhone(buyer.phone) : null;

    await prisma.order.update({
      where: { id: orderId },
      data: {
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        buyerCpf: finalCpf || null,
        buyerPhone: finalPhone,
        accessCode,
      },
    });

    // ============================================
    // MERCADO PAGO - PIX (recomendado no Brasil)
    // ============================================
    if (gateway === 'mercadopago' && method === 'pix' && mpClient) {
      const payment = new Payment(mpClient);

      const result = await payment.create({
        body: {
          transaction_amount: order.totalCents / 100,
          description: `Ingressos ${order.event.title} - Lorde Nelson`,
          payment_method_id: 'pix',
          payer: {
            email: buyer.email,
            first_name: buyer.name.split(' ')[0] || 'Cliente',
            last_name: buyer.name.split(' ').slice(1).join(' ') || '',
            identification: finalCpf ? { type: 'CPF', number: finalCpf } : undefined,
          },
          notification_url: `${APP_URL}/api/webhook/mercadopago`,
          external_reference: orderId,
        },
      });

      // Salvar payment id
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentGateway: 'mercadopago', paymentMethod: 'pix', paymentId: String(result.id) },
      });

      return NextResponse.json({
        success: true,
        type: 'pix',
        qr_code: result.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: result.point_of_interaction?.transaction_data?.qr_code_base64,
        paymentId: result.id,
        accessCode,
        message: 'Pague o PIX. Use o código de acesso para ver seus ingressos.',
      });
    }

    // ============================================
    // STRIPE - Cartão (Payment Intent + Elements)
    // ============================================
    if (gateway === 'stripe' && method === 'card' && stripe) {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: order.totalCents,
        currency: 'brl',
        automatic_payment_methods: { enabled: true },
        description: `Ingressos ${order.event.title}`,
        metadata: { orderId },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentGateway: 'stripe',
          paymentMethod: 'card',
          paymentId: paymentIntent.id,
        },
      });

      return NextResponse.json({
        success: true,
        type: 'stripe',
        clientSecret: paymentIntent.client_secret,
        publishableKey: STRIPE_PUBLISHABLE,
        accessCode,
        message: 'Confirme o cartão. Guarde seu código de acesso.',
      });
    }

    // Fallback (no real gateway keys configured) - dev/sim only
    console.warn('[PAY] Simulating payment (no gateway)');

    // Calculate fees from DB Settings (with sensible defaults)
    const feeInfo = await getFeeForMethod(method);
    const fee = Math.round(order.totalCents * feeInfo.percent / 100) + feeInfo.fixedCents;
    const net = order.totalCents - fee;

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'paid',
        paymentGateway: gateway,
        paymentMethod: method,
        accessCode,
        paidAt: new Date(),
        grossCents: order.totalCents,
        netCents: net,
        feeCents: fee,
        feeDetails: feeInfo.details,
      },
    });

    for (const t of order.tickets) {
      await prisma.ticket.update({
        where: { id: t.id },
        data: { qrPayload: signCode(t.uniqueCode) },
      });
    }

    const fullOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { tickets: { include: { ticketType: true } }, event: true },
    });

    if (fullOrder) await sendOrderConfirmation(fullOrder as unknown as import('@/lib/email').OrderWithDetails);

    // Virada automática (Fase 2) - após venda paga
    if (order.loteId) {
      const { performAutomaticVirada } = await import('@/app/api/admin/lotes/virar/route');
      await performAutomaticVirada(order.eventId);
    }

    return NextResponse.json({ success: true, type: 'simulated', accessCode, message: 'Simulado (configure chaves reais em produção)' });

  } catch (e: unknown) {
    console.error('Payment error', e);
    const msg = e instanceof Error ? e.message : 'Erro no processamento do pagamento';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
