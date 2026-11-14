import { spawnSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.json'], { stdio: 'inherit' });
if (result.status) process.exit(result.status);
await mkdir('apps/api/dist', { recursive: true });
await copyFile('apps/api/src/schema.sql', 'apps/api/dist/schema.sql');
