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
        '© {year} Lorde Nelson\nPortal moderno de ingressos.\n\nPagamentos via Stripe e Mercado Pago\nCheck-in no local',
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

  const data = await req.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  for (const [k, v] of Object.entries(data)) {
    if (!k || typeof k !== 'string' || k.length > 120) continue;
    await prisma.setting.upsert({
      where: { key: k },
      update: { value: String(v) },
      create: { key: k, value: String(v) },
    });
  }
  bustSettingsCache();
  return NextResponse.json({ ok: true });
}
