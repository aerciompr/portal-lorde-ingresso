import { NextRequest, NextResponse } from 'next/server';
import { getAppSettings } from '@/lib/settings';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const s = await getAppSettings();
  const clientId = s.payment.stripeClientId || process.env.STRIPE_CLIENT_ID || '';

  if (!clientId) {
    return NextResponse.json({ error: 'Stripe Client ID não configurado. Adicione em Configurações ou STRIPE_CLIENT_ID no .env' }, { status: 400 });
  }

  // OAuth authorize URL for Stripe Connect (Standard account recommended for full dashboard access)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'read_write',           // or 'read_write' for full access
    redirect_uri: `${APP_URL}/api/stripe/connect/callback`,
    // You can add 'stripe_user[email]' etc for prefill
  });

  const authorizeUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;

  return NextResponse.redirect(authorizeUrl);
}
