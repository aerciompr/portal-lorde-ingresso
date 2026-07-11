import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { bustSettingsCache } from '@/lib/settings';

export async function GET() {
  // Allow public access for publishable keys (secrets should stay in .env ideally)
  let rows = await prisma.setting.findMany();
  const obj: Record<string, string> = {};
  rows.forEach((r: any) => obj[r.key] = r.value);

  // Seed sensible defaults on first use (so fees work immediately)
  if (rows.length === 0) {
    const defaults = {
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
      footer_left: 'Lorde Nelson Rest Pub • Rua Silvério Jorge, 241, Jaraguá — Maceió/AL\nQui a Sáb • 20h às 02h • WhatsApp (82) 99647-1998',
      footer_right: '© {year} Lorde Nelson. Portal moderno de ingressos.\nPagamentos via Stripe e Mercado Pago • Check-in no local',
    };
    for (const [k, v] of Object.entries(defaults)) {
      await prisma.setting.upsert({ where: { key: k }, update: { value: v }, create: { key: k, value: v } });
      obj[k] = v;
    }
  }

  // Note: Branding defaults and seeding are handled in lib/settings.ts and seed scripts.
  // Removed always-on upsert here to avoid DB writes/locks on every public page load (Header fetches this).
  // This helps reduce startup and page load latency.

  return NextResponse.json(obj);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const data = await req.json();
  for (const [k, v] of Object.entries(data)) {
    await prisma.setting.upsert({
      where: { key: k },
      update: { value: String(v) },
      create: { key: k, value: String(v) },
    });
  }
  bustSettingsCache();
  return NextResponse.json({ ok: true });
}
