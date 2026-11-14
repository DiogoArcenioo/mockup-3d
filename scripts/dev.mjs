import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
if (existsSync('.env')) loadEnvFile('.env');
for (const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build'],['scripts/build-pwa.mjs'],['scripts/build-api.mjs']]) {
  const result = spawnSync(process.execPath, args, {stdio:'inherit'});
  if (result.status) process.exit(result.status);
}
const children = [
  spawn(process.execPath,['--env-file-if-exists=.env','--watch','apps/api/dist/main.js'],{stdio:'inherit'}),
  spawn(process.execPath,['node_modules/next/dist/bin/next','dev','apps/web','--hostname','0.0.0.0','--port','5173'],{stdio:'inherit'})
];
let closing=false;
function close(code=0){if(closing)return;closing=true;for(const child of children)child.kill();process.exitCode=code;}
for(const child of children){child.on('error',()=>close(1));child.on('exit',code=>close(code??0));}
process.on('SIGINT',()=>close());process.on('SIGTERM',()=>close());
