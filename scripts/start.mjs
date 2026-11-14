import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
if (existsSync('.env')) loadEnvFile('.env');
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', 'apps/api/dist/main.js'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } }),
  spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/web', '--hostname', '0.0.0.0', '--port', process.env.WEB_PORT || '5173'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } }),
];
let closing = false;
function close(code = 0) { if (closing) return; closing = true; for (const child of children) child.kill(); process.exitCode = code; }
for (const child of children) { child.on('error', () => close(1)); child.on('exit', code => close(code || 0)); }
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close());
