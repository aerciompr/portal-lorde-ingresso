import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, getAdminUser } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import { getLoyaltyReferralBonusCents, setLoyaltyReferralBonusCents } from '@/lib/loyalty-settings';
import { logLoyaltyAudit } from '@/lib/loyalty-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const referralBonusCents = await getLoyaltyReferralBonusCents();
  return NextResponse.json({ referralBonusCents });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const body = await req.json().catch(() => ({}));
  const cents = parseInt(String(body.referralBonusCents), 10);
  if (!Number.isFinite(cents) || cents < 0) {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
  }

  const previousCents = await getLoyaltyReferralBonusCents();
  await setLoyaltyReferralBonusCents(cents);

  void logLoyaltyAudit({
    action: 'referral_bonus_updated',
    actor: (await getAdminUser()) || 'admin',
    entityType: 'Setting',
    entityId: 'loyalty_referral_bonus_cents',
    detail: `Bônus de indicação alterado de ${(previousCents / 100).toFixed(2)} para ${(cents / 100).toFixed(2)}`,
    meta: { previousCents, newCents: cents },
  });

  return NextResponse.json({ ok: true, referralBonusCents: cents });
}
