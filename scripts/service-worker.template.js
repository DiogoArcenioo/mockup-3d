const VERSION = __BUILD_VERSION__;
const FILES = __PRECACHE_FILES__;
const BASE = new URL('./', self.location.href);
const PREFIX = `forma-mockup:${BASE.pathname}:`;
const CACHE_NAME = PREFIX + VERSION;
const APP_URL = new URL('index.html', BASE).href;
const ASSETS = new Set(FILES.map(file => new URL(file, BASE).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...ASSETS])));
  // A new version waits for existing app windows to close, preserving unsaved art.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;

  const appNavigation = request.mode === 'navigate' &&
    (url.pathname === BASE.pathname || url.pathname === new URL(APP_URL).pathname);
  if (appNavigation) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (!response.ok) throw new Error('O estúdio está temporariamente indisponível.');
        if (response.headers.get('content-type')?.includes('text/html')) {
          await cache.put(APP_URL, response.clone());
        }
        return response;
      } catch {
        const saved = await cache.match(APP_URL);
        if (saved) return saved;
        return new Response('Abra o estúdio com internet uma vez para usá-lo offline.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // Only app resources enter the cache. Uploaded files, APIs and external URLs do not.
  const assetURL = new URL(url);
  assetURL.search = '';
  if (!ASSETS.has(assetURL.href) && !url.pathname.startsWith(new URL('assets/', BASE).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const saved = await cache.match(request);
    if (saved) return saved;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
