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

/**
 * Ingresso em retrato (vertical) — ~metade de A4 em pé.
 * QR grande + margem para leitura em celular / impressão.
 */
export async function generateTicketPDF(params: TicketPDFParams) {
  const pdfDoc = await PDFDocument.create();
  // Retrato: largura 360 × altura 640 (proporção celular / ticket vertical)
  const page = pdfDoc.addPage([360, 640]);
  const { width, height } = page.getSize();
  const pad = 28;
  const contentW = width - pad * 2;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Fundo
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.06, 0.06, 0.07) });

  // Barra superior
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
  page.drawText('INGRESSO', {
    x: width - pad - 62,
    y: height - 32,
    size: 11,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  let y = height - headerH - 20;

  // Imagem do evento (topo, centralizada)
  const loaded = await loadImageForPdf(params.imageUrl);
  if (loaded) {
    try {
      const img =
        loaded.kind === 'png'
          ? await pdfDoc.embedPng(loaded.bytes)
          : await pdfDoc.embedJpg(loaded.bytes);

      const boxW = contentW;
      const boxH = 140;
      const scale = Math.min(boxW / img.width, boxH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const boxY = y - boxH;
      const drawX = pad + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;

      page.drawRectangle({
        x: pad - 2,
        y: boxY - 2,
        width: boxW + 4,
        height: boxH + 4,
        color: rgb(0.12, 0.12, 0.13),
        borderColor: rgb(0.25, 0.25, 0.28),
        borderWidth: 1,
      });
      page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
      y = boxY - 18;
    } catch (e) {
      console.warn('[ticket PDF] embed imagem falhou', e);
    }
  }

  // Evento
  const title = truncate(params.eventTitle, 48);
  page.drawText(title, {
    x: pad,
    y: y,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
    maxWidth: contentW,
  });
  y -= 22;
  page.drawText(truncate(params.eventDate, 52), {
    x: pad,
    y,
    size: 11,
    font,
    color: rgb(0.7, 0.7, 0.7),
    maxWidth: contentW,
  });
  y -= 16;
  page.drawText(truncate(params.address, 56), {
    x: pad,
    y,
    size: 10,
    font,
    color: rgb(0.55, 0.55, 0.55),
    maxWidth: contentW,
  });
  y -= 28;

  // Comprador
  page.drawText('NOME', { x: pad, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 16;
  page.drawText(truncate(params.buyerName || '—', 40), {
    x: pad,
    y,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
    maxWidth: contentW,
  });
  y -= 22;
  page.drawText('E-MAIL', { x: pad, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 15;
  page.drawText(truncate(params.buyerEmail || '—', 42), {
    x: pad,
    y,
    size: 10,
    font,
    color: rgb(0.85, 0.85, 0.85),
    maxWidth: contentW,
  });
  y -= 24;

  page.drawText(truncate(params.ticketType, 40), {
    x: pad,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0.4, 0.9, 0.6),
    maxWidth: contentW,
  });
  y -= 20;

  // QR grande no centro (melhor leitura impressa / câmera)
  const qrPayload = params.qrPayload || params.uniqueCode;
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  });
  const qrImageBytes = await fetch(qrDataUrl).then((r) => r.arrayBuffer());
  const qrImage = await pdfDoc.embedPng(qrImageBytes);

  const qrSize = 200;
  // reserva espaço inferior para código + legenda
  const qrY = Math.max(72, y - qrSize - 8);
  const qrX = (width - qrSize) / 2;

  // fundo branco sob o QR (quiet zone)
  page.drawRectangle({
    x: qrX - 10,
    y: qrY - 10,
    width: qrSize + 20,
    height: qrSize + 20,
    color: rgb(1, 1, 1),
  });
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  // Código do ingresso (legível sem câmera)
  const code = params.uniqueCode || '';
  const codeSize = 14;
  const codeW = fontBold.widthOfTextAtSize(code, codeSize);
  page.drawText(code, {
    x: Math.max(pad, (width - codeW) / 2),
    y: 48,
    size: codeSize,
    font: fontBold,
    color: rgb(0.95, 0.95, 0.95),
  });

  const hint = 'APRESENTE ESTE QR NO LOCAL';
  const hintW = font.widthOfTextAtSize(hint, 8);
  page.drawText(hint, {
    x: Math.max(pad, (width - hintW) / 2),
    y: 30,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });

  // Faixa lateral
  page.drawRectangle({ x: 0, y: 0, width: 5, height, color: rgb(0.2, 0.75, 0.45) });

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

  // feeDetails é só interno (admin/gateway) — nunca no PDF do cliente

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
