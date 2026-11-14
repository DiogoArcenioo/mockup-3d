import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { getSession } from '../../../lib/session';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const root = existsSync(path.resolve(process.cwd(), 'dist/index.html')) ? path.resolve(process.cwd(), 'dist') : path.resolve(process.cwd(), '../../dist');
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { user, unavailable } = await getSession();
  if (!user) return new Response('<!doctype html><html lang="pt-BR"><body><p>Sua sessão expirou. Entre novamente.</p><a href="/login" target="_top">Ir para o login</a><script>parent.postMessage("forma:session-expired",location.origin)</script></body></html>', { status: unavailable ? 503 : 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  const parts = (await context.params).path || ['index.html'];
  if (parts.some(part => part.includes('..') || part.includes('\\') || part.startsWith('.')) || parts.at(-1) === 'sw.js') return new Response('Não encontrado.', { status: 404 });
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(root + path.sep)) return new Response('Não encontrado.', { status: 404 });
  try { return new Response(await readFile(file), { headers: { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
  catch { return new Response('Módulo indisponível. Execute npm run build:legacy e tente novamente.', { status: 404 }); }
}
