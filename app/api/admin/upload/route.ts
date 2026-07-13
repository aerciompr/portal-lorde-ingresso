import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import {
  ensureUploadsDir,
  maxUploadBytes,
  publicUrlForMediaId,
  publicUrlForUpload,
  saveBufferToS3,
  uploadStorageMode,
} from '@/lib/uploads';
import { requireAdminMutation } from '@/lib/request-security';
import { parseImagePurpose, processUploadImage } from '@/lib/image-process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function baseName(originalName: string, ext: string): string {
  const raw = (originalName || 'image').replace(/\.[^.]+$/, '');
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'image';
  return `${safe}.${ext}`;
}

async function saveToDatabase(
  buffer: Buffer,
  mime: string,
  originalName: string
): Promise<{ url: string; storage: 'db'; id: string }> {
  const safeName = baseName(originalName, mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg');

  const row = await prisma.mediaFile.create({
    data: {
      name: safeName,
      mime: mime || 'image/jpeg',
      data: new Uint8Array(buffer),
      size: buffer.length,
    },
  });

  return {
    url: publicUrlForMediaId(row.id),
    storage: 'db',
    id: row.id,
  };
}

async function saveToDisk(
  buffer: Buffer,
  originalName: string,
  ext: string
): Promise<{ url: string; storage: 'disk'; filename: string }> {
  const uploadDir = await ensureUploadsDir();
  const filename = `${Date.now()}-${baseName(originalName, ext)}`;
  await writeFile(path.join(uploadDir, filename), buffer);
  return {
    url: publicUrlForUpload(filename),
    storage: 'disk',
    filename,
  };
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const mime = (file.type || '').toLowerCase();
    if (!mime.startsWith('image/')) {
      return NextResponse.json({ error: 'Apenas imagens são permitidas' }, { status: 400 });
    }

    const max = maxUploadBytes();
    if (typeof file.size === 'number' && file.size > max) {
      return NextResponse.json(
        { error: `Arquivo muito grande (máx. ${Math.round(max / 1024 / 1024)} MB)` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    let buffer = Buffer.from(bytes);
    if (buffer.length > max) {
      return NextResponse.json(
        { error: `Arquivo muito grande (máx. ${Math.round(max / 1024 / 1024)} MB)` },
        { status: 400 }
      );
    }

    const purpose = parseImagePurpose(
      formData.get('purpose') || formData.get('key') || formData.get('field')
    );

    let outMime = mime;
    let outExt = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    let processedMeta: { width?: number; height?: number; bytesIn: number; bytesOut: number } | null =
      null;

    try {
      const processed = await processUploadImage(buffer, purpose);
      buffer = Buffer.from(processed.buffer);
      outMime = processed.mime;
      outExt = processed.ext;
      processedMeta = {
        width: processed.width,
        height: processed.height,
        bytesIn: processed.bytesIn,
        bytesOut: processed.bytesOut,
      };
    } catch (e) {
      // Se sharp falhar, grava original (não bloqueia admin)
      console.warn('[upload] processImage falhou, salvando original:', (e as Error).message);
    }

    const mode = uploadStorageMode();
    let result: { url: string; storage: string; id?: string; filename?: string };
    const origName = file.name || 'image';

    if (mode === 'db') {
      result = await saveToDatabase(buffer, outMime, origName);
    } else if (mode === 's3') {
      const filename = `${Date.now()}-${baseName(origName, outExt)}`;
      const s3 = await saveBufferToS3(buffer, filename, outMime);
      result = { url: s3.url, storage: 's3', filename: s3.key };
    } else if (mode === 'disk') {
      result = await saveToDisk(buffer, origName, outExt);
    } else {
      try {
        result = await saveToDisk(buffer, origName, outExt);
      } catch (e) {
        console.warn('[upload] disk falhou, usando MySQL:', (e as Error).message);
        result = await saveToDatabase(buffer, outMime, origName);
      }
    }

    console.log('[upload] ok', {
      storage: result.storage,
      url: result.url,
      purpose,
      ...processedMeta,
    });

    return NextResponse.json({
      success: true,
      url: result.url,
      storage: result.storage,
      originalName: file.name,
      purpose,
      optimized: Boolean(processedMeta),
      bytes: processedMeta?.bytesOut ?? buffer.length,
      width: processedMeta?.width,
      height: processedMeta?.height,
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { code?: string };
    console.error('Upload error:', err?.code || err?.name, err?.message, err);

    if (err?.code === 'P2021' || err?.message?.includes('MediaFile') || err?.message?.includes('does not exist')) {
      return NextResponse.json(
        {
          error:
            'Tabela MediaFile não existe. No console do app: npx prisma db push --schema=./prisma/schema.prisma',
          code: 'MEDIA_TABLE_MISSING',
        },
        { status: 500 }
      );
    }

    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      return NextResponse.json(
        {
          error:
            'Sem permissão no disco. Defina UPLOAD_STORAGE=db no Environment (grava no MySQL, sem volume).',
          code: err.code,
        },
        { status: 500 }
      );
    }

    if (err?.code === 'ENOSPC') {
      return NextResponse.json({ error: 'Disco cheio no servidor', code: err.code }, { status: 500 });
    }

    return NextResponse.json(
      {
        error: err?.message || 'Falha no upload',
        code: err?.code || 'UPLOAD_FAILED',
      },
      { status: 500 }
    );
  }
}
