/**
 * Baixa imagem remota (cartaz do WP) e grava no storage do portal.
 */
import { writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import {
  ensureUploadsDir,
  publicUrlForMediaId,
  publicUrlForUpload,
  saveBufferToS3,
  uploadStorageMode,
} from '@/lib/uploads';
import { processUploadImage } from '@/lib/image-process';

export async function downloadAndStoreEventImage(
  imageUrl: string
): Promise<{ url: string } | { error: string }> {
  const url = (imageUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { error: 'URL inválida' };
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LordeNelson-Import/1.0' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const ab = await res.arrayBuffer();
    let buffer = Buffer.from(ab);
    if (buffer.length < 100) return { error: 'arquivo muito pequeno' };
    if (buffer.length > 12 * 1024 * 1024) return { error: 'arquivo > 12MB' };

    let mime = res.headers.get('content-type') || 'image/jpeg';
    let ext = 'jpg';
    try {
      const processed = await processUploadImage(buffer, 'event');
      buffer = Buffer.from(processed.buffer);
      mime = processed.mime;
      ext = processed.ext;
    } catch {
      /* mantém original */
    }

    const base = `woo-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const mode = uploadStorageMode();

    if (mode === 'db') {
      const row = await prisma.mediaFile.create({
        data: {
          name: base,
          mime,
          data: new Uint8Array(buffer),
          size: buffer.length,
        },
      });
      return { url: publicUrlForMediaId(row.id) };
    }
    if (mode === 's3') {
      const s3 = await saveBufferToS3(buffer, base, mime);
      return { url: s3.url };
    }
    // disk / auto
    try {
      const dir = await ensureUploadsDir();
      await writeFile(path.join(dir, base), buffer);
      return { url: publicUrlForUpload(base) };
    } catch {
      const row = await prisma.mediaFile.create({
        data: {
          name: base,
          mime,
          data: new Uint8Array(buffer),
          size: buffer.length,
        },
      });
      return { url: publicUrlForMediaId(row.id) };
    }
  } catch (e) {
    return { error: (e as Error).message || 'download falhou' };
  }
}
