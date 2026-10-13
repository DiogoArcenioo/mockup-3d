import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const template = await readFile(new URL('../scripts/service-worker.template.js', import.meta.url), 'utf8');
const files = ['index.html', 'manifest.webmanifest', 'assets/app.js', 'icons/icon-192.png'];
function worker(scope = '/mockups/', cachedNames = []) {
  const listeners = new Map();
  const storage = new Map(cachedNames.map(name => [name, new Map()]));
  const added = [];
  const fetched = [];
  let offline = false;
  let status = 200;
  let claimed = false;
  const key = request => typeof request === 'string' ? request : request.url;
  const caches = {
    async keys() { return [...storage.keys()]; },
    async delete(name) { return storage.delete(name); },
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const data = storage.get(name);
      return {
        async addAll(urls) {
          added.push(...urls);
          urls.forEach(url => data.set(url, new Response('offline studio', { headers: { 'content-type': 'text/html' } })));
        },
        async match(request) { return data.get(key(request))?.clone(); },
        async put(request, response) { data.set(key(request), response.clone()); },
      };
    },
  };
  runInNewContext(template.replace('__BUILD_VERSION__', '"current"')
    .replace('__PRECACHE_FILES__', JSON.stringify(files)), {
    self: {
      location: { href: `https://example.com${scope}sw.js` },
      addEventListener(name, callback) { listeners.set(name, callback); },
      clients: { async claim() { claimed = true; } },
    }, URL, Set, Response, caches,
    async fetch(request) {
      fetched.push(key(request));
      if (offline) throw new Error('offline');
      return new Response('online studio', { status, headers: { 'content-type': 'text/html' } });
    },
  });
  return {
    added, storage, fetched,
    setOffline(value) { offline = value; },
    setStatus(value) { status = value; },
    get claimed() { return claimed; },
    async lifecycle(name) {
      let pending;
      listeners.get(name)({ waitUntil(promise) { pending = promise; } });
      await pending;
    },
    async request(path, mode = 'navigate', method = 'GET') {
      let pending;
      listeners.get('fetch')({
        request: { url: new URL(path, 'https://example.com').href, mode, method },
        respondWith(promise) { pending = promise; },
      });
      return await pending;
    },
  };
}

test('manifest e ícones suportam instalação na raiz e em subpastas', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#365b46');
  assert.equal(manifest.prefer_related_applications, false);
  for (const scope of ['/', '/dist/', '/mockups/']) {
    const base = new URL(`https://example.com${scope}manifest.webmanifest`);
    assert.equal(new URL(manifest.start_url, base).pathname, scope + 'index.html');
    assert.equal(new URL(manifest.scope, base).pathname, scope);
    for (const icon of manifest.icons) {
      const png = await readFile(new URL('../public/' + icon.src, import.meta.url));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(icon.sizes, `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
      assert.ok(new URL(icon.src, base).pathname.startsWith(scope));
    }
  }
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
});

test('o app abre offline na raiz, no Live Server e em uma subpasta publicada', async () => {
  for (const scope of ['/', '/dist/', '/mockups/']) {
    const app = worker(scope);
    await app.lifecycle('install');
    assert.equal(app.added.length, files.length);
    assert.ok(app.added.every(url => new URL(url).pathname.startsWith(scope)));
    app.setOffline(true);
    assert.equal(await (await app.request(scope)).text(), 'offline studio');
    assert.equal(await (await app.request(scope + 'index.html')).text(), 'offline studio');
    assert.equal(await (await app.request(scope + 'assets/app.js', 'cors')).text(), 'offline studio');
    assert.equal(await app.request('/outside/index.html'), undefined);
  }
});

test('a navegação busca atualizações online e usa a cópia local em falhas de rede ou servidor', async () => {
  const app = worker();
  await app.lifecycle('install');
  assert.equal(await (await app.request('/mockups/index.html')).text(), 'online studio');
  app.setOffline(true);
  assert.equal(await (await app.request('/mockups/index.html')).text(), 'online studio');
  app.setOffline(false);
  app.setStatus(503);
  assert.equal(await (await app.request('/mockups/index.html')).text(), 'online studio');
});

test('atualizar limpa somente caches antigos do mesmo app e da mesma subpasta', async () => {
  const app = worker('/mockups/', ['forma-mockup:/mockups/:old', 'forma-mockup:/other/:old', 'unrelated-app']);
  await app.lifecycle('install');
  await app.lifecycle('activate');
  assert.equal(app.storage.has('forma-mockup:/mockups/:old'), false);
  assert.equal(app.storage.has('forma-mockup:/mockups/:current'), true);
  assert.equal(app.storage.has('forma-mockup:/other/:old'), true);
  assert.equal(app.storage.has('unrelated-app'), true);
  assert.equal(app.claimed, true);
});

test('arquivos enviados, APIs e conteúdo externo ficam fora do cache', async () => {
  const app = worker();
  await app.lifecycle('install');
  for (const [url, method] of [
    ['/mockups/upload', 'POST'], ['/mockups/art.png', 'GET'],
    ['/mockups/api', 'GET'], ['https://external.example/art.png', 'GET'],
    ['blob:https://example.com/user-art', 'GET'],
  ]) assert.equal(await app.request(url, 'cors', method), undefined);
  assert.equal(app.fetched.length, 0);
});
