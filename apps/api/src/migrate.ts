import { migrate, pool } from './database.js';
try { await migrate(); console.log('Banco preparado e administrador inicial criado, se ainda não existia.'); }
catch (error) { console.error('Falha ao preparar banco:', (error as { code?: string }).code || 'connection_error'); process.exitCode = 1; }
finally { await pool.end(); }
