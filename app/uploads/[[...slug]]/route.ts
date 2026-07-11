import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getUploadsDir } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (slug.some((s) => s === '..' || s.includes('\0') || s.includes('/') || s.includes('\\'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // /uploads/m/{id} → MySQL MediaFile (persiste entre deploys)
  if (slug[0] === 'm' && slug[1]) {
    const id = slug[1].replace(/\.[a-zA-Z0-9]+$/, ''); // aceita .jpg no fim
    try {
      const row = await prisma.mediaFile.findUnique({ where: { id } });
      if (!row) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }
      const body = Buffer.from(row.data);
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': row.mime || 'application/octet-stream',
          'Content-Length': String(body.length),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (e) {
      console.error('[uploads] media db', e);
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
  }

  // Disco local
  const filePath = path.join(getUploadsDir(), ...slug);
  const resolved = path.resolve(filePath);
  const root = path.resolve(getUploadsDir());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const fileBuffer = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.ico') contentType = 'image/x-icon';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
