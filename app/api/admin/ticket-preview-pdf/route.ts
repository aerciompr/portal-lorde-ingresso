import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { generateTicketPDF } from '@/lib/generate-ticket';
import { signCode } from '@/lib/validate-ticket';

/** PDF de exemplo do layout (admin) — não usa pedido real. */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sampleCode = 'LN-DEMO0001';

  // Usa a imagem do primeiro evento com poster, se houver
  const { prisma } = await import('@/lib/prisma');
  const withImage = await prisma.event.findFirst({
    where: { imageUrl: { not: null } },
    orderBy: { date: 'desc' },
    select: { title: true, imageUrl: true, date: true, openTime: true, address: true },
  });

  const pdfBytes = await generateTicketPDF({
    eventTitle: withImage?.title || 'Especial Beatles',
    eventDate: withImage
      ? `${new Date(withImage.date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} • ${withImage.openTime || '20:00'}`
      : 'domingo, 12 de julho de 2026 • 20:00',
    buyerName: 'João da Silva',
    buyerEmail: 'joao@email.com',
    ticketType: 'Ingresso Padrão',
    uniqueCode: sampleCode,
    qrPayload: signCode(sampleCode),
    address: withImage?.address || 'Rua Silvério Jorge, 241, Jaraguá, Maceió - AL',
    priceCents: 3500,
    imageUrl: withImage?.imageUrl || '/logo-lordenelson.jpg',
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="ingresso-preview-lordenelson.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
