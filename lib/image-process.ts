/**
 * Otimização única no upload — um arquivo por envio (sem gerenciar várias thumbs).
 * purpose define teto de dimensão e formato; o CSS do site escolhe object-fit no layout.
 *
 * event   → cartaz / card / página do evento (retrato até ~1080×1440)
 * banner  → hero do site
 * logo    → header
 * favicon → ícone pequeno
 * generic → fallback
 */

export type ImagePurpose = 'event' | 'banner' | 'logo' | 'favicon' | 'generic';

type Profile = {
  maxW: number;
  maxH: number;
  quality: number;
  /** png se alpha / favicon; senão webp */
  forcePng?: boolean;
};

const PROFILES: Record<ImagePurpose, Profile> = {
  event: { maxW: 1080, maxH: 1440, quality: 82 },
  banner: { maxW: 1920, maxH: 1080, quality: 80 },
  logo: { maxW: 512, maxH: 512, quality: 85 },
  favicon: { maxW: 128, maxH: 128, quality: 90, forcePng: true },
  generic: { maxW: 1600, maxH: 1600, quality: 82 },
};

export function parseImagePurpose(raw: unknown): ImagePurpose {
  const s = String(raw || '')
    .toLowerCase()
    .trim();
  if (s === 'event' || s === 'banner' || s === 'logo' || s === 'favicon' || s === 'generic') {
    return s;
  }
  // chaves de settings → purpose
  if (s === 'logo_url' || s === 'logo') return 'logo';
  if (s === 'favicon_url' || s === 'favicon') return 'favicon';
  if (s === 'banner_image_url' || s === 'banner') return 'banner';
  if (s === 'imageurl' || s === 'image_url' || s === 'event_image') return 'event';
  return 'generic';
}

export type ProcessedImage = {
  buffer: Buffer;
  mime: string;
  ext: string;
  width?: number;
  height?: number;
  bytesIn: number;
  bytesOut: number;
};

/**
 * Redimensiona (sem crop forçado), corrige EXIF, comprime.
 * fit: inside + withoutEnlargement → não estica e não corta arte.
 */
export async function processUploadImage(
  input: Buffer,
  purpose: ImagePurpose = 'generic'
): Promise<ProcessedImage> {
  const bytesIn = input.length;
  const profile = PROFILES[purpose] || PROFILES.generic;

  // sharp é dependency — falha controlada se binário ausente
  const sharp = (await import('sharp')).default;

  const base = sharp(input, { failOn: 'none' }).rotate();
  const meta = await base.metadata();

  let pipeline = sharp(input, { failOn: 'none' })
    .rotate()
    .resize(profile.maxW, profile.maxH, {
      fit: 'inside',
      withoutEnlargement: true,
    });

  const usePng = Boolean(profile.forcePng || meta.hasAlpha);

  let out: Buffer;
  let mime: string;
  let ext: string;

  if (usePng) {
    out = await pipeline.png({ compressionLevel: 9, effort: 7 }).toBuffer();
    mime = 'image/png';
    ext = 'png';
  } else {
    out = await pipeline.webp({ quality: profile.quality, effort: 4 }).toBuffer();
    mime = 'image/webp';
    ext = 'webp';
  }

  // Se por algum motivo aumentou (raro), mantém original se for imagem já ok
  if (out.length > bytesIn && bytesIn < 400_000 && (meta.format === 'jpeg' || meta.format === 'webp' || meta.format === 'png')) {
    return {
      buffer: input,
      mime: meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : 'image/jpeg',
      ext: meta.format === 'png' ? 'png' : meta.format === 'webp' ? 'webp' : 'jpg',
      width: meta.width,
      height: meta.height,
      bytesIn,
      bytesOut: bytesIn,
    };
  }

  const outMeta = await sharp(out).metadata();

  return {
    buffer: out,
    mime,
    ext,
    width: outMeta.width,
    height: outMeta.height,
    bytesIn,
    bytesOut: out.length,
  };
}
