import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';

export type LoyaltyCardPDFParams = {
  buyerName: string;
  planName: string;
  cardCode: string;
  qrPayload: string;
  freeEntriesPerCycle: number;
  checkinsPerEntry: number;
  renewsOnLabel: string;
  /** Posição de cadastro entre todos os sócios (1 = primeiro) — exibido como "Sócio Nº 001". */
  memberNumber?: number;
};

const GOLD = rgb(0.831, 0.686, 0.216); // #d4af37 — mesmo dourado da página /fidelidade

function truncate(text: string, max: number) {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

/**
 * Cartão de fidelidade digital — mesmo formato retrato do ingresso
 * (lib/generate-ticket.ts), sem imagem de evento, com QR do cardCode.
 * Identidade visual dourada (não verde), pra se diferenciar do ingresso comum.
 */
export async function generateLoyaltyCardPDF(params: LoyaltyCardPDFParams) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([360, 640]);
  const { width, height } = page.getSize();
  const pad = 28;
  const contentW = width - pad * 2;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.06, 0.06, 0.07) });

  // Moldura dourada fina
  page.drawRectangle({
    x: 6,
    y: 6,
    width: width - 12,
    height: height - 12,
    borderColor: GOLD,
    borderWidth: 1,
    borderOpacity: 0.35,
    color: undefined,
  });

  const headerH = 52;
  page.drawRectangle({
    x: 0,
    y: height - headerH,
    width,
    height: headerH,
    color: rgb(0.98, 0.98, 0.98),
  });
  page.drawText('LORDE NELSON • REST PUB', {
    x: pad,
    y: height - 32,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('CLUBE', {
    x: width - pad - 46,
    y: height - 32,
    size: 11,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  let y = height - headerH - 32;

  page.drawText('CARTÃO FIDELIDADE', {
    x: pad,
    y,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
    maxWidth: contentW,
  });
  y -= 24;
  page.drawText(truncate(params.planName, 40), {
    x: pad,
    y,
    size: 13,
    font: fontBold,
    color: GOLD,
    maxWidth: contentW,
  });
  y -= 26;

  if (params.memberNumber) {
    const memberLabel = `SÓCIO Nº ${String(params.memberNumber).padStart(3, '0')}`;
    page.drawText(memberLabel, {
      x: pad,
      y,
      size: 9,
      font: fontBold,
      color: GOLD,
      maxWidth: contentW,
    });
    y -= 18;
  }

  page.drawText('SÓCIO', { x: pad, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 16;
  page.drawText(truncate(params.buyerName || '—', 40), {
    x: pad,
    y,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
    maxWidth: contentW,
  });
  y -= 26;

  page.drawText('BENEFÍCIO MENSAL', { x: pad, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 15;
  const companion =
    params.checkinsPerEntry > 1
      ? `titular + até ${params.checkinsPerEntry - 1} acomp.`
      : 'só titular';
  const benefit = `${params.freeEntriesPerCycle} entrada(s) grátis/mês · ${companion}`;
  page.drawText(truncate(benefit, 46), {
    x: pad,
    y,
    size: 10,
    font,
    color: rgb(0.85, 0.85, 0.85),
    maxWidth: contentW,
  });
  y -= 20;
  page.drawText(truncate(params.renewsOnLabel, 46), {
    x: pad,
    y,
    size: 9,
    font,
    color: rgb(0.55, 0.55, 0.55),
    maxWidth: contentW,
  });
  y -= 20;

  const qrDataUrl = await QRCode.toDataURL(params.qrPayload, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  });
  const qrImageBytes = await fetch(qrDataUrl).then((r) => r.arrayBuffer());
  const qrImage = await pdfDoc.embedPng(qrImageBytes);

  const qrSize = 200;
  const qrY = Math.max(72, y - qrSize - 8);
  const qrX = (width - qrSize) / 2;

  page.drawRectangle({
    x: qrX - 10,
    y: qrY - 10,
    width: qrSize + 20,
    height: qrSize + 20,
    color: rgb(1, 1, 1),
  });
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const code = params.cardCode || '';
  const codeSize = 14;
  const codeW = fontBold.widthOfTextAtSize(code, codeSize);
  page.drawText(code, {
    x: Math.max(pad, (width - codeW) / 2),
    y: 48,
    size: codeSize,
    font: fontBold,
    color: rgb(0.95, 0.95, 0.95),
  });

  const hint = 'APRESENTE ESTE QR NO CHECK-IN';
  const hintW = font.widthOfTextAtSize(hint, 8);
  page.drawText(hint, {
    x: Math.max(pad, (width - hintW) / 2),
    y: 30,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });

  page.drawRectangle({ x: 0, y: 0, width: 5, height, color: GOLD });

  return pdfDoc.save();
}
