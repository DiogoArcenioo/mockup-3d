import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = new URL('../dist/', import.meta.url);
const entries = await readdir(dist, { recursive: true, withFileTypes: true });
const files = entries.filter(entry => entry.isFile()).map(entry =>
  relative(fileURLToPath(dist), join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  .filter(file => file === 'index.html' || file === 'manifest.webmanifest' ||
  file === 'favicon.svg' || file === 'favicon.png' || file.startsWith('assets/') || file.startsWith('icons/')).sort();

if (!files.includes('index.html') || !files.includes('icons/icon-512.png')) {
  throw new Error('A versão instalável precisa do HTML compilado e dos ícones PNG.');
}
const digest = createHash('sha256');
const template = await readFile(new URL('./service-worker.template.js', import.meta.url), 'utf8');
digest.update(template);
for (const file of files) {
  digest.update(file);
  digest.update(await readFile(new URL(file, dist)));
}
const version = digest.digest('hex').slice(0, 16);
await writeFile(new URL('sw.js', dist), template
  .replace('__BUILD_VERSION__', JSON.stringify(version))
  .replace('__PRECACHE_FILES__', JSON.stringify(files)));
console.log(`PWA pronta: ${files.length} arquivos locais; versão ${version}.`);
