/* Service worker do check-in — network-first (evita “cache eterno” após deploy) */
const CACHE = 'ln-checkin-v3';

self.addEventListener('install', (event) => {
  // ativa logo a nova versão
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('ln-checkin-') && k !== CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Nunca cacheia API
  if (url.pathname.startsWith('/api/')) return;

  // HTML / navegação: sempre tenta rede primeiro
  const isNav =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNav || url.pathname.startsWith('/checkin')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // JS/CSS com hash do Next: cache ok (immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // resto: rede primeiro, fallback cache
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    // só cacheia assets estáticos de apoio do check-in, não HTML
    const url = new URL(req.url);
    if (
      res.ok &&
      (url.pathname.endsWith('.webmanifest') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.webp'))
    ) {
      const copy = res.clone();
      const c = await caches.open(CACHE);
      await c.put(req, copy);
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) {
    const c = await caches.open(CACHE);
    await c.put(req, res.clone());
  }
  return res;
}
