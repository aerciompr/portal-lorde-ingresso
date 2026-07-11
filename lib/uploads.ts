import path from 'path';
import { mkdir, access, writeFile, unlink, constants } from 'fs/promises';

/**
 * Onde gravar uploads:
 * - db   (padrão produção): MySQL MediaFile — NÃO some no deploy (só env + banco)
 * - disk: pasta no container — precisa volume EasyPanel em UPLOADS_DIR
 * - auto: tenta disk; se falhar, usa db
 *
 * Env: UPLOAD_STORAGE=db|disk|auto
 */
export function uploadStorageMode(): 'db' | 'disk' | 'auto' {
  const m = (process.env.UPLOAD_STORAGE || 'db').toLowerCase().trim();
  if (m === 'disk' || m === 'auto' || m === 'db') return m;
  return 'db';
}

function candidateDirs(): string[] {
  const list: string[] = [];
  const fromEnv = process.env.UPLOADS_DIR?.trim();
  if (fromEnv) {
    list.push(path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv));
  }
  list.push('/app/data/uploads', path.join(process.cwd(), 'data', 'uploads'));
  list.push(path.join(process.cwd(), 'public', 'uploads'));
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
      console.log('[uploads] disk directory:', dir);
      return dir;
    }
  }

  const msg = `Nenhum diretório de upload gravável. Tentados: ${tried.join(', ')}`;
  console.error('[uploads]', msg);
  const err = new Error(msg) as NodeJS.ErrnoException;
  err.code = 'EACCES';
  throw err;
}

/** URL pública de arquivo no disco */
export function publicUrlForUpload(filename: string): string {
  return `/uploads/${filename.replace(/^\/+/, '')}`;
}

/** URL pública de arquivo no MySQL */
export function publicUrlForMediaId(id: string): string {
  return `/uploads/m/${id}`;
}

export function maxUploadBytes(): number {
  const n = Number(process.env.UPLOAD_MAX_BYTES || 8 * 1024 * 1024);
  return Number.isFinite(n) && n > 0 ? n : 8 * 1024 * 1024;
}
