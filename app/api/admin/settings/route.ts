import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { bustSettingsCache } from '@/lib/settings';
import { filterPublicSettings } from '@/lib/settings-public';
import { requireAdminMutation } from '@/lib/request-security';

/**
 * GET
 * - Público: só branding + chaves publishable (NÃO apaga nada do banco; só filtra a resposta).
 * - Admin autenticado: todas as chaves (necessário para tela de configurações).
 *
 * Mercado Pago / Stripe secrets permanecem no MySQL; não são retornados sem login admin.
 */
export async function GET() {
  let rows = await prisma.setting.findMany();
  const obj: Record<string, string> = {};
  rows.forEach((r) => {
    obj[r.key] = r.value;
  });

  if (rows.length === 0) {
    const defaults: Record<string, string> = {
      pix_fee_percent: '1.99',
      pix_fee_fixed_cents: '0',
      card_fee_percent: '3.99',
      card_fee_fixed_cents: '49',
      from_email: 'ingressos@lordenelson.com.br',
      cancel_hours: '12',
      cancel_fee: '10',
      site_name: 'Lorde Nelson',
      logo_url: '',
      favicon_url: '',
      banner_title: 'LORDE NELSON',
      banner_subtitle: 'Rest Pub • Shows, forró e grandes jogos. Compre seu ingresso agora.',
      footer_left:
        'Lorde Nelson Rest Pub\nRua Silvério Jorge, 241\nJaraguá — Maceió/AL\n\nQui a Sáb\n20h às 02h',
      footer_right:
        '© {year} Lorde Nelson\nPortal de ingressos.\n\nCheck-in no local',
      pay_pix_enabled: '1',
      pay_pix_label: 'PIX',
      pay_pix_hint: 'Aprovação na hora',
      pay_pix_provider: 'mercadopago',
      pay_card_enabled: '1',
      pay_card_label: 'Cartão',
      pay_card_hint: 'Crédito e débito',
      pay_card_provider: 'stripe',
      whatsapp_display: '(82) 99647-1998',
      whatsapp_e164: '5582996471998',
    };
    for (const [k, v] of Object.entries(defaults)) {
      await prisma.setting.upsert({
        where: { key: k },
        update: { value: v },
        create: { key: k, value: v },
      });
      obj[k] = v;
    }
  }

  if (await isAdmin()) {
    return NextResponse.json(obj);
  }

  return NextResponse.json(filterPublicSettings(obj));
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  let saved = 0;
  const errors: string[] = [];

  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (!k || typeof k !== 'string' || k.length > 120) continue;
    // null/undefined → string vazia (permite limpar)
    const value =
      v === null || v === undefined
        ? ''
        : typeof v === 'string'
          ? v
          : typeof v === 'number' || typeof v === 'boolean'
            ? String(v)
            : JSON.stringify(v);
    try {
      await prisma.setting.upsert({
        where: { key: k },
        update: { value },
        create: { key: k, value },
      });
      saved += 1;
    } catch (e) {
      console.error('[settings POST]', k, e);
      errors.push(k);
    }
  }

  bustSettingsCache();

  if (saved === 0 && errors.length) {
    return NextResponse.json(
      { error: `Falha ao gravar: ${errors.join(', ')}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    saved,
    ...(errors.length ? { partialErrors: errors } : {}),
  });
}
