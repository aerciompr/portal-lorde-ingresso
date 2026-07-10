import path from 'path';
import { mkdir, access, constants } from 'fs/promises';

/**
 * Diretório de uploads no disco.
 * - Padrão: public/uploads (servido por app/uploads e /uploads estático se existir)
 * - Override: UPLOADS_DIR (caminho absoluto ou relativo a cwd) — útil com volume EasyPanel
 */
export function getUploadsDir(): string {
  const fromEnv = process.env.UPLOADS_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), 'public', 'uploads');
}

export async function ensureUploadsDir(): Promise<string> {
  const dir = getUploadsDir();
  await mkdir(dir, { recursive: true });
  // Verifica escrita (falha cedo com EACCES no Docker se permissão errada)
  await access(dir, constants.W_OK);
  return dir;
}

export function publicUrlForUpload(filename: string): string {
  // Sempre exposto via /uploads/... (route handler ou estático)
  return `/uploads/${filename.replace(/^\/+/, '')}`;
}

/** Max bytes (default 8MB) */
export function maxUploadBytes(): number {
  const n = Number(process.env.UPLOAD_MAX_BYTES || 8 * 1024 * 1024);
  return Number.isFinite(n) && n > 0 ? n : 8 * 1024 * 1024;
}
