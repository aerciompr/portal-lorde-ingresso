import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminUser } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import { signCode } from '@/lib/validate-ticket';
import { generateLoyaltyCardPDF } from '@/lib/generate-loyalty-card';
import { formatDateInAppTz } from '@/lib/timezone';
import { sendLoyaltyCardEmail } from '@/lib/email';
import { logLoyaltyAudit } from '@/lib/loyalty-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/admin/loyalty-members/[id]/resend-card — reenvia o PDF do cartão por e-mail. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;
  const { id } = await ctx.params;

  const membership = await prisma.loyaltyMembership.findUnique({
    where: { id },
    include: { plan: true },
  });
  if (!membership) {
    return NextResponse.json({ error: 'Sócio não encontrado' }, { status: 404 });
  }

  const memberNumber =
    (await prisma.loyaltyMembership.count({
      where: { createdAt: { lte: membership.createdAt } },
    })) || undefined;

  const renewsOnLabel = membership.currentPeriodEnd
    ? `Renova em ${formatDateInAppTz(membership.currentPeriodEnd, { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    : 'Renovação pendente da 1ª cobrança';

  const pdfBytes = await generateLoyaltyCardPDF({
    buyerName: membership.buyerName,
    planName: membership.plan.name,
    cardCode: membership.cardCode,
    qrPayload: signCode(membership.cardCode),
    freeEntriesPerCycle: membership.plan.freeEntriesPerCycle,
    checkinsPerEntry: membership.plan.checkinsPerEntry,
    renewsOnLabel,
    memberNumber,
  });

  const mail = await sendLoyaltyCardEmail({
    to: membership.buyerEmail,
    buyerName: membership.buyerName,
    planName: membership.plan.name,
    cardCode: membership.cardCode,
    pdfBytes: Buffer.from(pdfBytes),
  });

  if (!mail.ok) {
    return NextResponse.json({ error: mail.error || 'Falha ao enviar e-mail' }, { status: 500 });
  }

  void logLoyaltyAudit({
    action: 'card_resent',
    actor: (await getAdminUser()) || 'admin',
    entityType: 'LoyaltyMembership',
    entityId: membership.id,
    detail: `Cartão reenviado para ${membership.buyerEmail}`,
  });

  return NextResponse.json({ ok: true });
}
