import { test } from 'node:test';
import assert from 'node:assert/strict';
const base = process.env.WEB_TEST_URL || 'http://localhost:5173';
test('Next + Nest: páginas protegidas, proxy de login, módulos e encerramento de sessão', async () => {
  const login = await fetch(base + '/login');
  assert.equal(login.status, 200);
  const html = await login.text();
  assert.match(html, /name="login"/);
  assert.match(html, /name="password"/);
  assert.match(html, /viewport/);
  assert.doesNotMatch(html, /PGPASSWORD|password_hash/);
  assert.equal(html.includes(process.env.ADMIN_PASSWORD), false);
  for (const route of ['/inicio', '/estoque', '/financeiro', '/mockup', '/usuarios']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 307, route);
    assert.match(response.headers.get('location'), /\/login/);
  }
  assert.equal((await fetch(base + '/legacy/index.html')).status, 401);
  const signedIn = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD }) });
  assert.equal(signedIn.status, 201);
  const cookie = signedIn.headers.get('set-cookie').split(';')[0];
  try {
    for (const route of ['/inicio', '/estoque', '/financeiro', '/mockup', '/usuarios']) {
      const response = await fetch(base + route, { headers: { Cookie: cookie }, redirect: 'manual' });
      assert.equal(response.status, 200, route);
      if(route==='/inicio')assert.match(await response.text(),/aria-haspopup="menu"/);
      if(route==='/financeiro'){
        const page=await response.text();assert.match(page,/Extrato financeiro/);assert.match(page,/Atividades/);
        assert.doesNotMatch(page,/<iframe/);assert.doesNotMatch(page,/legacy\/index.html#history/);
      }
    }
    const legacy = await fetch(base + '/legacy/index.html', { headers: { Cookie: cookie } });
    assert.equal(legacy.status, 200);
    const legacyHtml = await legacy.text();
    const entry = legacyHtml.match(/src="(\/legacy\/assets\/[^\"]+\.js)"/)[1];
    const entryResponse = await fetch(base + entry, { headers: { Cookie: cookie } });
    assert.equal(entryResponse.status, 200);
    assert.match(entryResponse.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(base + entry)).status, 401);
    assert.equal((await fetch(base + '/legacy/api/products', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(base + '/api/finance/statement', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(base + '/api/finance/statement')).status, 401);
    assert.equal((await fetch(base + '/legacy/sw.js', { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await fetch(base + '/legacy/.env', { headers: { Cookie: cookie } })).status, 404);
  } finally {
    const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}' });
    assert.equal(logout.status, 201);
  }
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).status, 401);
  assert.equal((await fetch(base + '/legacy/index.html', { headers: { Cookie: cookie } })).status, 401);
});
