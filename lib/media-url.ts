/** Tipo MIME a partir da extensão/URL */
export function mimeFromUrl(url: string): string {
  const u = (url || '').split('?')[0].toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.gif')) return 'image/gif';
  if (u.endsWith('.svg')) return 'image/svg+xml';
  if (u.endsWith('.ico')) return 'image/x-icon';
  return 'image/png';
}

/** URL absoluta para favicon/logo (Next metadata prefere absolute) */
export function absoluteMediaUrl(pathOrUrl: string, baseUrl: string): string {
  const p = (pathOrUrl || '').trim();
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
  const base = (baseUrl || '').replace(/\/$/, '');
  if (!base) return p.startsWith('/') ? p : `/${p}`;
  return p.startsWith('/') ? `${base}${p}` : `${base}/${p}`;
}
