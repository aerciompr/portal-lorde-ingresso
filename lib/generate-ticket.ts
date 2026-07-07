import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';

export async function generateTicketPDF(params: {
  eventTitle: string;
  eventDate: string;
  buyerName: string;
  buyerEmail: string;
  ticketType: string;
  uniqueCode: string;
  qrPayload: string;
  address: string;
  priceCents: number;
}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 340]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Background
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.06, 0.06, 0.07) });

  // Header bar
  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: rgb(0.98, 0.98, 0.98) });

  page.drawText('LORDE NELSON • REST PUB', {
    x: 30, y: height - 38, size: 13, font: fontBold, color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('INGRESSO', {
    x: width - 110, y: height - 38, size: 12, font, color: rgb(0.3, 0.3, 0.3),
  });

  // Event info
  page.drawText(params.eventTitle, { x: 30, y: height - 95, size: 18, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText(params.eventDate, { x: 30, y: height - 118, size: 12, font, color: rgb(0.7, 0.7, 0.7) });
  page.drawText(params.address, { x: 30, y: height - 138, size: 10, font, color: rgb(0.55, 0.55, 0.55) });

  // Buyer
  page.drawText('NOME', { x: 30, y: height - 175, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(params.buyerName || '—', { x: 30, y: height - 192, size: 14, font: fontBold, color: rgb(1, 1, 1) });

  page.drawText('E-MAIL', { x: 30, y: height - 220, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(params.buyerEmail, { x: 30, y: height - 235, size: 11, font, color: rgb(0.85, 0.85, 0.85) });

  // Type + code
  page.drawText(params.ticketType, { x: 30, y: height - 270, size: 12, font: fontBold, color: rgb(0.4, 0.9, 0.6) });

  page.drawText(params.uniqueCode, {
    x: 30, y: 45, size: 22, font: fontBold, color: rgb(0.95, 0.95, 0.95),
  });

  // QR Code
  const qrDataUrl = await QRCode.toDataURL(params.qrPayload || params.uniqueCode, { width: 160, margin: 0 });
  const qrImageBytes = await fetch(qrDataUrl).then(r => r.arrayBuffer());
  const qrImage = await pdfDoc.embedPng(qrImageBytes);

  const qrSize = 132;
  page.drawImage(qrImage, {
    x: width - qrSize - 28,
    y: 28,
    width: qrSize,
    height: qrSize,
  });

  page.drawText('APRESENTE ESTE QR NO LOCAL', {
    x: width - qrSize - 28, y: 18, size: 7, font, color: rgb(0.4, 0.4, 0.4),
  });

  // Border accent
  page.drawRectangle({ x: 0, y: 0, width: 6, height, color: rgb(0.2, 0.75, 0.45) });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
