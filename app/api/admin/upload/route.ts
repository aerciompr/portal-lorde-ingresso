import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { writeFile } from 'fs/promises';
import path from 'path';
import {
  ensureUploadsDir,
  maxUploadBytes,
  publicUrlForUpload,
} from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const uploadDir = await ensureUploadsDir();

    const safeName = (file.name || 'image')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
    const filename = `${Date.now()}-${safeName}`;
    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({
      success: true,
      url: publicUrlForUpload(filename),
      originalName: file.name,
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error('Upload error:', err?.code || err?.name, err?.message, err);

    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      return NextResponse.json(
        {
          error:
            'Sem permissão para gravar uploads no servidor. Redeploy com Dockerfile atualizado ou monte volume gravável em /app/public/uploads.',
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
        error: 'Falha no upload',
        code: err?.code || 'UPLOAD_FAILED',
        detail: process.env.NODE_ENV !== 'production' ? err?.message : undefined,
      },
      { status: 500 }
    );
  }
}
