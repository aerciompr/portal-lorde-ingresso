import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import { readFile } from 'fs/promises';
import path from 'path';

export type TicketPDFParams = {
  eventTitle: string;
  eventDate: string;
  buyerName: string;
  buyerEmail: string;
  ticketType: string;
  uniqueCode: string;
  qrPayload: string;
  address: string;
  priceCents: number;
  /** URL absoluta ou path público (/uploads/..., /logo-...) */
  imageUrl?: string | null;
};

function truncate(text: string, max: number) {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

async function loadImageForPdf(
  imageUrl?: string | null
): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' } | null> {
  if (!imageUrl?.trim()) return null;
  const raw = imageUrl.trim();

  try {
    let bytes: Uint8Array;
    let contentType = '';

    if (raw.startsWith('data:')) {
      const m = raw.match(/^data:([^;]+);base64,(.+)$/s);
      if (!m) return null;
      contentType = m[1];
      bytes = new Uint8Array(Buffer.from(m[2], 'base64'));
    } else if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const res = await fetch(raw);
      if (!res.ok) return null;
      contentType = res.headers.get('content-type') || '';
      bytes = new Uint8Array(await res.arrayBuffer());
    } else {
      const rel = raw.replace(/^\//, '').replace(/\.\./g, '');
      // /uploads/m/{id} → MySQL
      if (rel.startsWith('uploads/m/')) {
        const id = rel.slice('uploads/m/'.length).replace(/\.[a-zA-Z0-9]+$/, '');
        const { prisma } = await import('@/lib/prisma');
        const row = await prisma.mediaFile.findUnique({ where: { id } });
        if (!row) return null;
        contentType = row.mime;
        bytes = new Uint8Array(row.data);
      } else if (rel.startsWith('uploads/')) {
        const { getUploadsDir } = await import('@/lib/uploads');
        const filePath = path.join(getUploadsDir(), rel.slice('uploads/'.length));
        bytes = new Uint8Array(await readFile(filePath));
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.webp') contentType = 'image/webp';
      } else {
        const filePath = path.join(process.cwd(), 'public', rel);
        bytes = new Uint8Array(await readFile(filePath));
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.webp') contentType = 'image/webp';
      }
    }

    const isPng =
      contentType.includes('png') ||
      (bytes[0] === 0x89 && bytes[1] === 0x50);
    const isJpg =
      contentType.includes('jpeg') ||
      contentType.includes('jpg') ||
      (bytes[0] === 0xff && bytes[1] === 0xd8);

    if (isPng) return { bytes, kind: 'png' };
    if (isJpg) return { bytes, kind: 'jpg' };
    // webp e outros: pdf-lib não embute nativamente
    console.warn('[ticket PDF] formato de imagem não suportado (use PNG/JPG):', raw.slice(0, 80));
    return null;
  } catch (e) {
    console.warn('[ticket PDF] falha ao carregar imagem:', e);
    return null;
  }
}

export async function generateTicketPDF(params: TicketPDFParams) {
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
    x: 30,
    y: height - 38,
    size: 13,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('INGRESSO', {
    x: width - 110,
    y: height - 38,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Coluna direita: imagem do evento (topo) + QR (baixo)
  const rightColW = 132;
  const rightX = width - rightColW - 28;
  let textRightLimit = width - 40;

  const loaded = await loadImageForPdf(params.imageUrl);
  if (loaded) {
    try {
      const img =
        loaded.kind === 'png'
          ? await pdfDoc.embedPng(loaded.bytes)
          : await pdfDoc.embedJpg(loaded.bytes);

      const boxW = rightColW;
      const boxH = 100;
      const boxY = height - 60 - 12 - boxH; // abaixo do header
      const scale = Math.min(boxW / img.width, boxH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = rightX + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;

      // fundo sutil da moldura
      page.drawRectangle({
        x: rightX - 4,
        y: boxY - 4,
        width: boxW + 8,
        height: boxH + 8,
        color: rgb(0.12, 0.12, 0.13),
        borderColor: rgb(0.25, 0.25, 0.28),
        borderWidth: 1,
      });

      page.drawImage(img, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });

      textRightLimit = rightX - 16;
    } catch (e) {
      console.warn('[ticket PDF] embed imagem falhou', e);
    }
  }

  // Event info (esquerda)
  const title = truncate(params.eventTitle, 42);
  page.drawText(title, {
    x: 30,
    y: height - 95,
    size: 17,
    font: fontBold,
    color: rgb(1, 1, 1),
    maxWidth: textRightLimit - 30,
  });
  page.drawText(truncate(params.eventDate, 48), {
    x: 30,
    y: height - 118,
    size: 11,
    font,
    color: rgb(0.7, 0.7, 0.7),
    maxWidth: textRightLimit - 30,
  });
  page.drawText(truncate(params.address, 55), {
    x: 30,
    y: height - 138,
    size: 10,
    font,
    color: rgb(0.55, 0.55, 0.55),
    maxWidth: textRightLimit - 30,
  });

  // Buyer
  page.drawText('NOME', { x: 30, y: height - 175, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(truncate(params.buyerName || '—', 36), {
    x: 30,
    y: height - 192,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('E-MAIL', { x: 30, y: height - 220, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(truncate(params.buyerEmail || '—', 40), {
    x: 30,
    y: height - 235,
    size: 11,
    font,
    color: rgb(0.85, 0.85, 0.85),
  });

  // Type + code
  page.drawText(truncate(params.ticketType, 32), {
    x: 30,
    y: height - 270,
    size: 12,
    font: fontBold,
    color: rgb(0.4, 0.9, 0.6),
  });

  page.drawText(params.uniqueCode, {
    x: 30,
    y: 45,
    size: 20,
    font: fontBold,
    color: rgb(0.95, 0.95, 0.95),
  });

  // QR Code (canto inferior direito)
  const qrDataUrl = await QRCode.toDataURL(params.qrPayload || params.uniqueCode, {
    width: 160,
    margin: 0,
  });
  const qrImageBytes = await fetch(qrDataUrl).then((r) => r.arrayBuffer());
  const qrImage = await pdfDoc.embedPng(qrImageBytes);

  const qrSize = loaded ? 100 : 132;
  const qrY = 28;
  page.drawImage(qrImage, {
    x: rightX + (rightColW - qrSize) / 2,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  page.drawText('APRESENTE ESTE QR NO LOCAL', {
    x: rightX - 2,
    y: 14,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Border accent
  page.drawRectangle({ x: 0, y: 0, width: 6, height, color: rgb(0.2, 0.75, 0.45) });

  return pdfDoc.save();
}

export type RefundReceiptParams = {
  eventTitle: string;
  eventDate: string;
  buyerName: string;
  buyerEmail: string;
  orderId: string;
  accessCode?: string | null;
  totalCents: number;
  refundCents?: number | null;
  ticketCodes: string[];
  feeDetails?: string | null;
};

/** Comprovante de estorno (sem QR de entrada) */
export async function generateRefundReceiptPDF(params: RefundReceiptParams) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 420]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.06, 0.06, 0.07) });
  page.drawRectangle({ x: 0, y: height - 56, width, height: 56, color: rgb(0.55, 0.12, 0.12) });

  page.drawText('LORDE NELSON • REST PUB', {
    x: 32,
    y: height - 34,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText('COMPROVANTE DE ESTORNO', {
    x: width - 210,
    y: height - 34,
    size: 11,
    font: fontBold,
    color: rgb(1, 0.85, 0.85),
  });

  page.drawText('Este ingresso NAO e valido para entrada.', {
    x: 32,
    y: height - 82,
    size: 12,
    font: fontBold,
    color: rgb(0.95, 0.45, 0.45),
  });

  const lines: [string, string][] = [
    ['Evento', truncate(params.eventTitle, 50)],
    ['Data', truncate(params.eventDate, 40)],
    ['Cliente', truncate(params.buyerName, 40)],
    ['E-mail', truncate(params.buyerEmail, 45)],
    ['Pedido', params.orderId.slice(0, 24)],
    ['Codigo acesso', params.accessCode || '—'],
    [
      'Valor pago',
      `R$ ${(params.totalCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    ],
  ];

  if (params.refundCents != null) {
    lines.push([
      'Valor estornado',
      `R$ ${(params.refundCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    ]);
  }

  let y = height - 120;
  for (const [label, value] of lines) {
    page.drawText(label.toUpperCase(), {
      x: 32,
      y,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText(value, {
      x: 32,
      y: y - 16,
      size: 12,
      font: fontBold,
      color: rgb(0.92, 0.92, 0.92),
    });
    y -= 40;
  }

  if (params.ticketCodes.length) {
    page.drawText('CODIGOS DOS INGRESSOS (CANCELADOS)', {
      x: 32,
      y: y + 8,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 12;
    for (const c of params.ticketCodes.slice(0, 6)) {
      page.drawText(c, {
        x: 32,
        y,
        size: 11,
        font: fontBold,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 16;
    }
  }

  if (params.feeDetails) {
    page.drawText(truncate(`Obs: ${params.feeDetails}`, 80), {
      x: 32,
      y: 36,
      size: 8,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  page.drawText('Documento informativo — sem valor para check-in.', {
    x: 32,
    y: 18,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawRectangle({ x: 0, y: 0, width: 6, height, color: rgb(0.75, 0.2, 0.2) });

  return pdfDoc.save();
}
