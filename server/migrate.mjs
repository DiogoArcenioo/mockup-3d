import { createPool, migrate } from './db.mjs';
const pool = createPool();
try { await migrate(pool); console.log('Estrutura financeira pronta no PostgreSQL.'); }
catch (error) { console.error('Não foi possível preparar o banco:', error.code ?? 'connection_error'); process.exitCode = 1; }
finally { await pool.end(); }
