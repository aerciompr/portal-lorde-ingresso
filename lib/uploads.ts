import path from 'path';
import { mkdir, access, writeFile, unlink, constants } from 'fs/promises';

/**
 * Onde gravar uploads:
 * - db   : MySQL MediaFile
 * - disk : pasta no container (volume EasyPanel)
 * - s3   : S3/R2 compatível (env S3_*)
 * - auto : tenta disk; se falhar, db
 *
 * Env: UPLOAD_STORAGE=db|disk|s3|auto
 */
export function uploadStorageMode(): 'db' | 'disk' | 'auto' | 's3' {
  const m = (process.env.UPLOAD_STORAGE || 'disk').toLowerCase().trim();
  if (m === 'disk' || m === 'auto' || m === 'db' || m === 's3') return m;
  return 'disk';
}

/** Upload S3/R2 opcional — requer @aws-sdk/client-s3 e env */
export async function saveBufferToS3(
  buffer: Buffer,
  filename: string,
  mime: string
): Promise<{ url: string; key: string }> {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || 'auto';
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const publicBase = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
  if (!bucket || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3 não configurado (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)');
  }
  // dynamic import — só carrega se usar s3
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  const key = `uploads/${filename.replace(/^\/+/, '')}`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mime || 'application/octet-stream',
      ACL: 'public-read',
    })
  );
  const url = publicBase
    ? `${publicBase}/${key}`
    : endpoint
      ? `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`
      : `https://${bucket}.s3.amazonaws.com/${key}`;
  return { url, key };
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
