import { createPool, migrate } from './db.mjs';
import { createApp } from './app.mjs';

const host=process.env.HOST ?? '127.0.0.1';
if ((process.env.NODE_ENV === 'production' || !['127.0.0.1','localhost','::1'].includes(host)) && !process.env.FINANCE_PASSWORD) {
  throw new Error('Defina FINANCE_PASSWORD antes de disponibilizar a gestão na rede.');
}
const pool=createPool();
try { await migrate(pool); }
catch(error) { console.error('PostgreSQL indisponível. Confira a configuração privada .env. Código:',error.code ?? 'connection_error'); await pool.end(); process.exit(1); }
const server=createApp(pool).listen(Number(process.env.PORT ?? 3001),host,()=>console.log(`Gestão financeira: http://${host}:${process.env.PORT ?? 3001}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>pool.end().then(()=>process.exit(0))));
