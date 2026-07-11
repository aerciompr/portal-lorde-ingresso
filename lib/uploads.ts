import path from 'path';
import { mkdir, access, writeFile, unlink, constants } from 'fs/promises';

/**
 * Candidatos a diretório de upload (primeiro gravável vence).
 * Produção: use volume EasyPanel em /app/data/uploads (docs/UPLOADS_PERSISTENTES.md).
 * /tmp só como último recurso — some no restart do container.
 */
function candidateDirs(): string[] {
  const list: string[] = [];
  const fromEnv = process.env.UPLOADS_DIR?.trim();
  if (fromEnv) {
    list.push(path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv));
  }
  list.push('/app/data/uploads', path.join(process.cwd(), 'data', 'uploads'));
  // legado / fallbacks
  list.push(path.join(process.cwd(), 'public', 'uploads'));
  if (process.env.NODE_ENV !== 'production') {
    list.push('/tmp/lordenelson-uploads');
  }
  return [...new Set(list)];
}

let cachedWritableDir: string | null = null;

export function getUploadsDir(): string {
  if (cachedWritableDir) return cachedWritableDir;
  const fromEnv = process.env.UPLOADS_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), 'data', 'uploads');
}

async function isWritableDir(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    await writeFile(probe, 'ok');
    await unlink(probe).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** Resolve e cacheia o primeiro diretório realmente gravável */
export async function ensureUploadsDir(): Promise<string> {
  if (cachedWritableDir) {
    await mkdir(cachedWritableDir, { recursive: true });
    return cachedWritableDir;
  }

  const tried: string[] = [];
  for (const dir of candidateDirs()) {
    tried.push(dir);
    if (await isWritableDir(dir)) {
      cachedWritableDir = dir;
      if (process.env.NODE_ENV === 'production') {
        console.log('[uploads] using directory:', dir);
      }
      return dir;
    }
  }

  const msg = `Nenhum diretório de upload gravável. Tentados: ${tried.join(', ')}`;
  console.error('[uploads]', msg);
  const err = new Error(msg) as NodeJS.ErrnoException;
  err.code = 'EACCES';
  throw err;
}

export function publicUrlForUpload(filename: string): string {
  return `/uploads/${filename.replace(/^\/+/, '')}`;
}

export function maxUploadBytes(): number {
  const n = Number(process.env.UPLOAD_MAX_BYTES || 8 * 1024 * 1024);
  return Number.isFinite(n) && n > 0 ? n : 8 * 1024 * 1024;
}
