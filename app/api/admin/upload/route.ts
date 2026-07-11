import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import {
  ensureUploadsDir,
  maxUploadBytes,
  publicUrlForMediaId,
  publicUrlForUpload,
  uploadStorageMode,
} from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function saveToDatabase(
  buffer: Buffer,
  mime: string,
  originalName: string
): Promise<{ url: string; storage: 'db'; id: string }> {
  const safeName = (originalName || 'image')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

  const row = await prisma.mediaFile.create({
    data: {
      name: safeName,
      mime: mime || 'image/jpeg',
      data: buffer,
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
  originalName: string
): Promise<{ url: string; storage: 'disk'; filename: string }> {
  const uploadDir = await ensureUploadsDir();
  const safeName = (originalName || 'image')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
  const filename = `${Date.now()}-${safeName}`;
  await writeFile(path.join(uploadDir, filename), buffer);
  return {
    url: publicUrlForUpload(filename),
    storage: 'disk',
    filename,
  };
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    const buffer = Buffer.from(bytes);
    if (buffer.length > max) {
      return NextResponse.json(
        { error: `Arquivo muito grande (máx. ${Math.round(max / 1024 / 1024)} MB)` },
        { status: 400 }
      );
    }

    const mode = uploadStorageMode();
    let result: { url: string; storage: string; id?: string; filename?: string };

    if (mode === 'db') {
      result = await saveToDatabase(buffer, mime, file.name || 'image');
    } else if (mode === 'disk') {
      result = await saveToDisk(buffer, file.name || 'image');
    } else {
      // auto: disco se possível, senão MySQL
      try {
        result = await saveToDisk(buffer, file.name || 'image');
      } catch (e) {
        console.warn('[upload] disk falhou, usando MySQL:', (e as Error).message);
        result = await saveToDatabase(buffer, mime, file.name || 'image');
      }
    }

    console.log('[upload] ok', { storage: result.storage, url: result.url, bytes: buffer.length });

    return NextResponse.json({
      success: true,
      url: result.url,
      storage: result.storage,
      originalName: file.name,
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
