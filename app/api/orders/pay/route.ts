import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { sendOrderConfirmation } from '@/lib/email';
import { signCode } from '@/lib/validate-ticket';
import { getFeeForMethod, getAppSettings } from '@/lib/settings';
import { isValidCpf, isValidPhone, cleanCpf, cleanPhone } from '@/lib/masks';

// Load keys preferring DB settings (configurable in admin) over .env
async function getPaymentClients() {
  const s = await getAppSettings();
  const STRIPE_SECRET = s.payment.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '';
  const STRIPE_ACCOUNT_ID = s.payment.stripeAccountId || '';
  const STRIPE_ACCESS_TOKEN = s.payment.stripeAccessToken || STRIPE_SECRET; // prefer OAuth token if present

  const MP_ACCESS_TOKEN = s.payment.mpAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
  const STRIPE_CLIENT_ID = s.payment.stripeClientId || process.env.STRIPE_CLIENT_ID || '';

  let stripe: Stripe | null = null;
  if (STRIPE_ACCESS_TOKEN) {
    stripe = new Stripe(STRIPE_ACCESS_TOKEN, {
      // When using Connect OAuth, pass { stripeAccount: STRIPE_ACCOUNT_ID } in individual calls
    });
  }

  const mpClient = MP_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN }) : null;
  return { stripe, mpClient, STRIPE_SECRET, MP_ACCESS_TOKEN, STRIPE_ACCOUNT_ID, STRIPE_CLIENT_ID };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, buyer } = body;
    const method: string = body.method === 'card' ? 'card' : 'pix';

    const s = await getAppSettings();
    const { stripe, mpClient, STRIPE_ACCOUNT_ID, MP_ACCESS_TOKEN } = await getPaymentClients();
    const STRIPE_PUBLISHABLE = s.payment.stripePublishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '';

    // Provedor vem do admin (labels/meios), não do cliente
    const settingRows = await prisma.setting.findMany();
    const rawSettings: Record<string, string> = {};
    settingRows.forEach((r) => {
      rawSettings[r.key] = r.value;
    });
    const { resolvePayGateway, paymentMethodsFromRaw } = await import('@/lib/payment-methods');
    const methodsCfg = paymentMethodsFromRaw(rawSettings);
    const methodCfg = methodsCfg.find((m) => m.id === method);
    if (methodCfg && !methodCfg.enabled) {
      return NextResponse.json({ error: 'Forma de pagamento indisponível' }, { status: 400 });
    }
    const gateway = resolvePayGateway(method, rawSettings);

    // Prefer public URL configured in Admin (useful for ngrok / production)
    const rawAppUrl = s.publicUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const APP_URL = rawAppUrl.replace(/\/$/, '');

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

    let finalPhone: string | null = null;
    if (buyer?.phone) {
      const cleanedPhone = cleanPhone(buyer.phone);
      if (!isValidPhone(cleanedPhone)) {
        return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 });
      }
      finalPhone = cleanedPhone;
    }

    const accessCode = 'LN-' + Math.random().toString(36).slice(2, 8).toUpperCase();

    const finalCpf = cleanCpf(buyer.cpf || '');

    // Senha opcional na compra (cadastro leve)
    let buyerPasswordHash: string | null = null;
    const plainPass = typeof buyer?.password === 'string' ? buyer.password.trim() : '';
    if (plainPass) {
      if (plainPass.length < 6) {
        return NextResponse.json(
          { error: 'Senha deve ter no mínimo 6 caracteres (ou deixe em branco)' },
          { status: 400 }
        );
      }
      const { hashPassword } = await import('@/lib/auth');
      buyerPasswordHash = await hashPassword(plainPass);
    }

    const buyerEmailNorm = String(buyer.email || '').trim().toLowerCase();

    await prisma.order.update({
      where: { id: orderId },
      data: {
        buyerName: buyer.name,
        buyerEmail: buyerEmailNorm,
        buyerCpf: finalCpf || null,
        buyerPhone: finalPhone,
        accessCode,
        ...(buyerPasswordHash ? { buyerPasswordHash } : {}),
      },
    });

    // Propaga senha a outros pedidos do mesmo e-mail/CPF (login unificado)
    if (buyerPasswordHash) {
      const orClause: Array<{ buyerEmail?: string; buyerCpf?: string }> = [];
      if (buyerEmailNorm) orClause.push({ buyerEmail: buyerEmailNorm });
      if (finalCpf) orClause.push({ buyerCpf: finalCpf });
      if (orClause.length) {
        await prisma.order.updateMany({
          where: { OR: orClause },
          data: { buyerPasswordHash },
        });
      }
    }

    // ============================================
    // MERCADO PAGO - PIX (recomendado no Brasil)
    // ============================================
    if (gateway === 'mercadopago' && method === 'pix') {
      if (!mpClient || !MP_ACCESS_TOKEN) {
        return NextResponse.json({ error: 'Mercado Pago não configurado. Vá em Admin > Configurações > Gateways e adicione o "Access Token" do Mercado Pago (chave que começa com TEST- para testes ou APP_USR- para produção).' }, { status: 400 });
      }

      const payment = new Payment(mpClient);

      const amount = order.totalCents / 100;
      const nameParts = (buyer.name || '').trim().split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || ' ';

      // MP requires https notification_url for production (live) tokens
      const isLiveToken = MP_ACCESS_TOKEN && (
        MP_ACCESS_TOKEN.startsWith('APP_USR-') || !MP_ACCESS_TOKEN.toUpperCase().includes('TEST')
      );
      const isHttp = APP_URL.startsWith('http://');

      if (isLiveToken && isHttp) {
        return NextResponse.json({
          error: [
            'Você está usando chaves de PRODUÇÃO do Mercado Pago.',
            '',
            'A URL de notificação (webhook) precisa ser HTTPS.',
            `URL atual: ${APP_URL}`,
            '',
            '=== OPÇÃO MAIS FÁCIL (recomendada para desenvolvimento) ===',
            '1. No Mercado Pago, use as CREDENCIAIS DE TESTE (sandbox)',
            '2. No dashboard: https://www.mercadopago.com.br/developers/panel/credentials',
            '3. Copie o "Access Token" que começa com TEST-',
            '4. Cole em Admin > Configurações > Gateways (Mercado Pago)',
            '',
            '=== PARA TESTAR COM CHAVES REAIS ===',
            '- Rode: npx ngrok http 3000',
            '- Copie a URL https gerada (ex: https://abcd-1234.ngrok.io)',
            '- Cole essa URL no campo "URL Pública do Site" em Admin > Configurações > Gateways',
            '- Ou defina NEXT_PUBLIC_APP_URL no .env',
          ].join('\n')
        }, { status: 400 });
      }

      // Build phone correctly: MP requires { area_code, number }
      let phoneObj: { area_code: string; number: string } | undefined;
      if (finalPhone && finalPhone.length >= 10) {
        phoneObj = {
          area_code: finalPhone.slice(0, 2),
          number: finalPhone.slice(2),
        };
      }

      try {
        const result: any = await payment.create({
          body: {
            transaction_amount: amount,
            description: `Ingressos ${order.event.title} - Lorde Nelson`,
            payment_method_id: 'pix',
            payer: {
              email: buyer.email,
              first_name: firstName,
              last_name: lastName || ' ',
              ...(finalCpf ? { identification: { type: 'CPF', number: finalCpf } } : {}),
              ...(phoneObj ? { phone: phoneObj } : {}),
            },
            notification_url: `${APP_URL}/api/webhook/mercadopago`,
            external_reference: orderId,
          },
        });

        // MP SDK v3 can return error at root or result.body.error
        const err = result?.error || result?.body?.error;
        if (err) {
          const msg = err.message || err.cause?.[0]?.description || JSON.stringify(err);
          console.error('[MP] error from result:', err);
          throw new Error(`Mercado Pago PIX: ${msg}`);
        }

        // Data can be at root or under .body
        const paymentData = result?.body || result;
        const pixData = paymentData?.point_of_interaction?.transaction_data || {};
        const paymentId = paymentData?.id;

        if (!pixData.qr_code) {
          console.error('[MP] no qr_code in response:', paymentData);
          throw new Error('Não foi possível gerar o QR Code do PIX. Verifique: 1) Access Token correto (sandbox TEST- ou produção), 2) PIX habilitado na conta Mercado Pago (no dashboard), 3) Chave não expirada, 4) Para produção use URL HTTPS.');
        }

        await prisma.order.update({
          where: { id: orderId },
          data: { paymentGateway: 'mercadopago', paymentMethod: 'pix', paymentId: String(paymentId) },
        });

        return NextResponse.json({
          success: true,
          type: 'pix',
          qr_code: pixData.qr_code,
          qr_code_base64: pixData.qr_code_base64,
          paymentId,
          accessCode,
          message: 'Pague o PIX. Use o código de acesso para ver seus ingressos.',
        });
      } catch (mpErr: any) {
        console.error('Mercado Pago PIX error completo:', mpErr);
        const detail = mpErr?.message || mpErr?.cause?.[0]?.description || '';
        throw new Error(`Erro ao gerar PIX no Mercado Pago. ${detail || 'Verifique as chaves em Configurações (Access Token), se a conta tem PIX liberado e se não está usando chave de produção em localhost sem https.'}`);
      }
    }

    // ============================================
    // STRIPE - Cartão (Payment Intent + Elements)
    // Supports both direct API keys AND Stripe Connect (OAuth login)
    // When using Connect, we can later fetch available payment methods from the account.
    // ============================================
    if (gateway === 'stripe' && method === 'card') {
      if (!stripe) {
        return NextResponse.json({ error: 'Stripe não configurado. Adicione Publishable + Secret Key (ou use o botão Conectar Stripe OAuth) em Admin > Configurações > Gateways.' }, { status: 400 });
      }
      const createOptions: any = {
        amount: order.totalCents,
        currency: 'brl',
        automatic_payment_methods: { enabled: true },
        description: `Ingressos ${order.event.title}`,
        metadata: { orderId },
      };

      // If Stripe Connect (OAuth) is configured, pass the account id
      const stripeAccount = STRIPE_ACCOUNT_ID || undefined;

      const paymentIntent = await stripe.paymentIntents.create(
        createOptions,
        stripeAccount ? { stripeAccount } : undefined
      );

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
        stripeAccountId: stripeAccount,
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
      const { performAutomaticVirada } = await import('@/lib/lote-virada');
      await performAutomaticVirada(order.eventId);
    }

    return NextResponse.json({ success: true, type: 'simulated', accessCode, message: 'Simulado (configure chaves reais em produção)' });

  } catch (e: unknown) {
    console.error('Payment error', e);
    const msg = e instanceof Error ? e.message : 'Erro no processamento do pagamento';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
