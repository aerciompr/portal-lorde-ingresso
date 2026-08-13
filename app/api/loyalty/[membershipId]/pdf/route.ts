import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { signCode } from '@/lib/validate-ticket';
import { generateLoyaltyCardPDF } from '@/lib/generate-loyalty-card';
import { formatDateInAppTz } from '@/lib/timezone';

/**
 * PDF do cartão de fidelidade.
 * - Admin autenticado: ok
 * - Público: exige ?code= batendo o cardCode da membership
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> }
) {
  const { membershipId } = await params;
  const admin = await isAdmin();
  const code = (req.nextUrl.searchParams.get('code') || '').toUpperCase().trim();

  const membership = await prisma.loyaltyMembership.findUnique({
    where: { id: membershipId },
    include: { plan: true },
  });

  if (!membership) {
    return new NextResponse('Cartão não encontrado', { status: 404 });
  }

  if (!admin) {
    const cardCode = (membership.cardCode || '').toUpperCase();
    if (!code || !cardCode || code !== cardCode) {
      return new NextResponse(
        'Não autorizado. Abra o PDF a partir de Meus Ingressos (com o código do cartão).',
        { status: 401 }
      );
    }
  }

  const qrPayload = signCode(membership.cardCode);
  const renewsOnLabel = membership.currentPeriodEnd
    ? `Renova em ${formatDateInAppTz(membership.currentPeriodEnd, { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    : 'Renovação pendente da 1ª cobrança';

  const memberNumber =
    (await prisma.loyaltyMembership.count({
      where: { createdAt: { lte: membership.createdAt } },
    })) || undefined;

  const pdfBytes = await generateLoyaltyCardPDF({
    buyerName: membership.buyerName,
    planName: membership.plan.name,
    cardCode: membership.cardCode,
    qrPayload,
    freeEntriesPerCycle: membership.plan.freeEntriesPerCycle,
    checkinsPerEntry: membership.plan.checkinsPerEntry,
    renewsOnLabel,
    memberNumber,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="cartao-fidelidade-${membership.cardCode}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
