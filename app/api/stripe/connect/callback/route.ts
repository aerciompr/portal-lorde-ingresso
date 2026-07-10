import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAppSettings, saveAppSettings } from '@/lib/settings';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${APP_URL}/admin/configuracoes?stripe_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.json({ error: 'Código de autorização ausente' }, { status: 400 });
  }

  const s = await getAppSettings();
  const clientId = s.payment.stripeClientId || process.env.STRIPE_CLIENT_ID || '';
  const clientSecret = s.payment.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '';

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Stripe Client ID ou Secret Key não configurados' }, { status: 400 });
  }

  try {
    // Exchange code for access token using Stripe's OAuth token endpoint
    const stripe = new Stripe(clientSecret);

    // Use fetch to the token endpoint (Stripe doesn't expose a high-level method for this in the SDK easily)
    const tokenResponse = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }).toString(),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    // tokenData contains:
    // access_token, refresh_token, stripe_publishable_key, stripe_user_id (the account), scope, livemode, etc.

    await saveAppSettings({
      stripe_account_id: tokenData.stripe_user_id,
      stripe_access_token: tokenData.access_token,
      stripe_refresh_token: tokenData.refresh_token,
      stripe_publishable_key: tokenData.stripe_publishable_key, // override if wanted
    });

    // Redirect back to config page with success
    return NextResponse.redirect(`${APP_URL}/admin/configuracoes?stripe_connected=1&account=${tokenData.stripe_user_id}`);
  } catch (e: any) {
    console.error('Stripe Connect error:', e);
    return NextResponse.redirect(`${APP_URL}/admin/configuracoes?stripe_error=${encodeURIComponent(e.message || 'Erro ao conectar')}`);
  }
}
